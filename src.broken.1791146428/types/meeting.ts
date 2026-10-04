export type FieldType = "signature" | "name" | "date";

export type PreparedField = {
  id: string;
  type: FieldType;
  x: number;
  y: number;
  width?: number;  
  height?: number;
  page?: number;
  recipientName?: string;
};

export type Participant = {
  name: string;
  email: string;
  department?: string;
  division?: string;
  designation?: string;
  phoneNumber?: string;
  signed: boolean;
  order?: number;
  isCurrent?: boolean;
  signedAt?: Date;
  role?: string;
  signature?: string;
  signaturePositions?: any[];
};

export type MeetingDoc = {
  _id?: string;
  title: string;
  date?: string;
  description: string;
  participants: Participant[];
  fileName: string;
  filePath: string;
  status: "Prepared" | "Draft" | "Sent" | "Completed" | string;
  organizerId: string;
  fields?: PreparedField[];
  signingMode?: "sequential" | "parallel";  // Sequential (one by one) or Parallel (all at once)
  currentSignerIndex?: number;  // Only used for sequential mode
  createdAt: Date;
  updatedAt?: Date;
  sentAt?: Date;
};
