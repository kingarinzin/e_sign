import { ObjectId } from "mongodb";

export interface User {
  _id?: ObjectId;
  email: string;
  password: string;
  
  // Personal Information
  name: string;
  cidNumber?: string;        // 11-digit CID number
  designation?: string;
  phoneNumber?: string;
  
  // Organization Details
  department?: string;
  division?: string;
  
  // Signature
  signature?: string;
  initials?: string;
  
  // Admin & Approval
  isAdmin?: boolean;
  isApproved?: boolean;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approvedBy?: ObjectId;
  approvedAt?: Date;
  isActive?: boolean;
  
  // Timestamps
  createdAt: Date;
  
  // OTP for login
  loginOtp?: {
    code: string;
    expiresAt: Date;
    attempts: number;
  };
}