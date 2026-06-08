export type User = {
  id: string;
  email: string;
  username: string;
  created_at?: string;
  is_active?: boolean;
};

export type LoginResponse = {
  access_token: string;
  token_type?: string;
  user: User;
};

export type RegisterPayload = {
  email: string;
  username: string;
  password: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};
