import { getDatabase } from '../db/database';
import { Review } from '../models';

export interface CreateReviewInput {
  bookingId: string;
  customerId: string;
  companionId: string;
  rating: number;
  reviewText: string;
}

export class ReviewService {
  private get db() {
    return getDatabase();
  }

  async listReviews(companionId?: string): Promise<Review[]> {
    return this.db.getReviews(companionId);
  }

  async createReview(input: CreateReviewInput): Promise<Review> {
    const booking = await this.db.getBookingById(input.bookingId);
    if (!booking) {
      throw new Error(`Booking "${input.bookingId}" not found.`);
    }

    if (booking.status !== 'completed' && booking.status !== 'reviewed') {
      throw new Error('Reviews can only be submitted for completed bookings.');
    }

    const rating = Math.min(5, Math.max(1, Math.round(input.rating)));
    const reviewId = `rev-${Date.now()}`;
    const now = new Date().toISOString();

    const review: Review = {
      id: reviewId,
      bookingId: input.bookingId,
      customerId: input.customerId,
      companionId: input.companionId,
      rating,
      reviewText: input.reviewText.trim(),
      createdAt: now
    };

    await this.db.createReview(review);

    // Update companion's rating & review count
    const companion = await this.db.getCompanionById(input.companionId);
    if (companion) {
      const newReviews = companion.reviews + 1;
      const newRating = Number(((companion.rating * companion.reviews + rating) / newReviews).toFixed(2));
      await this.db.upsertCompanion({
        ...companion,
        reviews: newReviews,
        rating: newRating,
        updatedAt: now
      });
    }

    // Mark booking as reviewed
    await this.db.updateBooking(input.bookingId, {
      status: 'reviewed',
      rating,
      review: input.reviewText.trim()
    });

    return review;
  }
}
