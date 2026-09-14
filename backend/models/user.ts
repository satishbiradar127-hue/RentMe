export type UserRole = 'customer' | 'companion' | 'admin';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  phone?: string;
  passwordHash?: string;
  authId?: string;
  createdAt: string;
  updatedAt: string;
}
