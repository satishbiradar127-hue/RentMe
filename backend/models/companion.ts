import { VerificationStatus } from './profile';

export interface Companion {
  id: string;
  userId?: string;
  name: string;
  city: string;
  category: string;
  rate: number;
  rating: number;
  reviews: number;
  response: string;
  status: string;
  verificationStatus?: VerificationStatus;
  image: string;
  specialties: string[];
  bio: string;
  createdAt: string;
  updatedAt: string;
}
