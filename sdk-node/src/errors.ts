export type Office2PDFErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  | "INVALID_REQUEST"
  | "SERVER_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNKNOWN";

export class Office2PDFError extends Error {
  public readonly code: Office2PDFErrorCode;
  public readonly status?: number;
  public readonly requestId?: string;
  public readonly details?: unknown;

  constructor(args: {
    message: string;
    code: Office2PDFErrorCode;
    status?: number;
    requestId?: string;
    details?: unknown;
  }) {
    super(args.message);
    this.name = "Office2PDFError";
    this.code = args.code;
    this.status = args.status;
    this.requestId = args.requestId;
    this.details = args.details;
  }
}
