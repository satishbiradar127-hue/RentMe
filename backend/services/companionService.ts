import { getDatabase } from '../db/database';
import { Companion, Experience, Availability } from '../models';

export interface CompanionFilterParams {
  category?: string;
  query?: string;
}

export interface CompanionDetail extends Companion {
  experiences: Experience[];
  availability: string[];
}

export class CompanionService {
  private get db() {
    return getDatabase();
  }

  async listCompanions(params?: CompanionFilterParams): Promise<CompanionDetail[]> {
    const companions = await this.db.getCompanions();
    const result: CompanionDetail[] = [];

    const category = params?.category && params.category !== 'All' ? params.category : null;
    const query = params?.query?.trim().toLowerCase() || null;

    for (const c of companions) {
      if (category && c.category !== category) continue;

      const experiences = await this.db.getExperiencesByCompanionId(c.id);
      const availList = await this.db.getAvailability(c.id);
      const dates = availList.map((a) => a.date);

      if (query) {
        const fullText = [
          c.name,
          c.city,
          c.category,
          c.bio,
          ...c.specialties,
          ...experiences.map((e) => `${e.title} ${e.description}`)
        ].join(' ').toLowerCase();

        if (!fullText.includes(query)) continue;
      }

      const verificationStatus = c.verificationStatus || (c.status === 'ID Verified' ? 'verified' : 'unverified');

      result.push({
        ...c,
        verificationStatus,
        experiences,
        availability: dates
      });
    }

    return result;
  }

  async getCompanionById(id: string): Promise<CompanionDetail | null> {
    const c = await this.db.getCompanionById(id);
    if (!c) return null;

    const experiences = await this.db.getExperiencesByCompanionId(c.id);
    const availList = await this.getAvailability(c.id);
    const dates = availList.map((a) => a.date);
    const verificationStatus = c.verificationStatus || (c.status === 'ID Verified' ? 'verified' : 'unverified');

    return {
      ...c,
      verificationStatus,
      experiences,
      availability: dates
    };
  }

  async getAvailability(companionId: string): Promise<Availability[]> {
    const companion = await this.db.getCompanionById(companionId);
    if (!companion) return [];
    const isVerified =
      companion.status === 'ID Verified' ||
      companion.status === 'verified' ||
      companion.verificationStatus === 'verified';
    if (!isVerified) {
      return [];
    }
    return this.db.getAvailability(companionId);
  }

  async listExperiences(): Promise<Experience[]> {
    return this.db.getExperiences();
  }

  async getCompanionByUserId(userId: string): Promise<Companion | null> {
    const companions = await this.db.getCompanions();
    return companions.find((c) => c.userId === userId) || null;
  }
}

