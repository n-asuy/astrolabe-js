import { HTTPException } from "hono/http-exception";

export class ApiError extends Error {
  constructor(
    public readonly status: 400 | 401 | 500,
    message: string,
  ) {
    super(message);
  }

  toResponse(): Response {
    return Response.json({ error: this.message }, { status: this.status });
  }
}

export function unauthorized(message: string): ApiError {
  return new ApiError(401, message);
}

export function badRequest(message: string): ApiError {
  return new ApiError(400, message);
}

export function internal(message: string): ApiError {
  return new ApiError(500, message);
}
