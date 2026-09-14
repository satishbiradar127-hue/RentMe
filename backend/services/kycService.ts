import { getDatabase } from '../db/database';
import { KycVerification, KycDocumentType, VerificationStatus } from '../models';
import { MockKycProvider, KycProvider } from '../providers/kycProvider';
import { getNotificationService, NotificationService } from './notificationService';

export interface SubmitKycInput {
  userId: string;
  documentType: KycDocumentType;
  documentNumber: string;
}

export class KycService {
  private get db() {
    return getDatabase();
  }

  private get notificationService(): NotificationService {
    return getNotificationService();
  }

  private provider: KycProvider;

  constructor(provider?: KycProvider) {
    this.provider = provider || new MockKycProvider();
  }

  async submitKyc(input: SubmitKycInput): Promise<KycVerification> {
    const user = await this.db.getUserById(input.userId);
    if (!user) {
      throw new Error(`User with ID "${input.userId}" not found.`);
    }

    const companions = await this.db.getCompanions();
    const companion = companions.find((c) => c.userId === user.id);

    const result = await this.provider.submitVerification({
      userId: user.id,
      companionId: companion?.id,
      documentType: input.documentType,
      documentNumber: input.documentNumber
    });

    const now = new Date().toISOString();
    const verificationId = `kyc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const kycRecord: KycVerification = {
      id: verificationId,
      userId: user.id,
      companionId: companion?.id,
      documentType: input.documentType,
      documentNumberMasked: result.documentNumberMasked,
      status: result.status,
      providerVerificationId: result.verificationId,
      rejectionReason: result.rejectionReason,
      submittedAt: now,
      reviewedAt: result.status === 'verified' ? now : undefined,
      createdAt: now,
      updatedAt: now
    };

    await this.db.createKycVerification(kycRecord);

    // Update profile
    const profile = await this.db.getProfileByUserId(user.id);
    if (profile) {
      await this.db.upsertProfile({
        ...profile,
        idVerified: result.status === 'verified',
        verificationStatus: result.status,
        updatedAt: now
      });
    }

    // Update companion if applicable
    if (companion) {
      const companionStatus = result.status === 'verified' ? 'ID Verified' : result.status;
      await this.db.upsertCompanion({
        ...companion,
        status: companionStatus,
        verificationStatus: result.status,
        updatedAt: now
      });
    }

    // Audit log
    await this.db.createAuditLog({
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      actorId: user.id,
      actorRole: user.role,
      action: 'KYC_SUBMITTED',
      targetType: 'KYC_VERIFICATION',
      targetId: verificationId,
      payload: { documentType: input.documentType, status: result.status },
      createdAt: now
    });

    // Send KYC notifications (in-app, email)
    await this.notificationService.notifyKycStatus(user.id, result.status, {
      documentType: input.documentType
    });

    return kycRecord;
  }

  async getKycStatus(userId: string): Promise<{
    status: VerificationStatus;
    verifications: KycVerification[];
    profileVerified: boolean;
    companionStatus?: string;
  }> {
    const verifications = await this.db.getKycVerificationsByUserId(userId);
    const profile = await this.db.getProfileByUserId(userId);
    const companions = await this.db.getCompanions();
    const companion = companions.find((c) => c.userId === userId);

    const latestStatus = verifications[0]?.status || profile?.verificationStatus || 'unverified';

    return {
      status: latestStatus,
      verifications,
      profileVerified: profile?.idVerified || latestStatus === 'verified',
      companionStatus: companion?.status
    };
  }

  async listVerifications(status?: VerificationStatus): Promise<KycVerification[]> {
    const all = await this.db.getKycVerifications();
    if (status) {
      return all.filter((v) => v.status === status);
    }
    return all;
  }

  async reviewVerification(
    verificationId: string,
    adminId: string,
    decision: 'verified' | 'rejected',
    notes?: string
  ): Promise<KycVerification> {
    const verification = await this.db.getKycVerificationById(verificationId);
    if (!verification) {
      throw new Error(`KYC Verification record "${verificationId}" not found.`);
    }

    const now = new Date().toISOString();
    const updated = await this.db.updateKycVerification(verificationId, {
      status: decision,
      reviewerAdminId: adminId,
      reviewedAt: now,
      rejectionReason: decision === 'rejected' ? notes || 'Verification rejected by administrator.' : undefined
    });

    if (!updated) {
      throw new Error(`Failed to update KYC Verification "${verificationId}".`);
    }

    // Update profile
    const profile = await this.db.getProfileByUserId(verification.userId);
    if (profile) {
      await this.db.upsertProfile({
        ...profile,
        idVerified: decision === 'verified',
        verificationStatus: decision,
        updatedAt: now
      });
    }

    // Update companion if linked
    if (verification.companionId) {
      const companion = await this.db.getCompanionById(verification.companionId);
      if (companion) {
        await this.db.upsertCompanion({
          ...companion,
          status: decision === 'verified' ? 'ID Verified' : 'rejected',
          verificationStatus: decision,
          updatedAt: now
        });
      }
    }

    // Audit log
    await this.db.createAuditLog({
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      actorId: adminId,
      actorRole: 'admin',
      action: `KYC_${decision.toUpperCase()}`,
      targetType: 'KYC_VERIFICATION',
      targetId: verificationId,
      payload: { decision, notes },
      createdAt: now
    });

    // Send KYC review notification (in-app, email)
    await this.notificationService.notifyKycStatus(verification.userId, decision, {
      rejectionReason: notes
    });

    return updated;
  }
}

