export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface Profile {
  id: string;
  userId: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  city: string;
  idVerified: boolean;
  verificationStatus: VerificationStatus;
  createdAt: string;
  updatedAt: string;
}
