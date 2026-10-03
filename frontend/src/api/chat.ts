import api from "./client";

export type ChatMode = "SUPPORT" | "PRODUCT";

export interface ChatProductCard {
  id: number;
  name: string;
  description?: string;
  price: number;
  stock: number;
  available: boolean;
  imageUrl?: string;
  categoryName?: string;
}

export interface ChatResponse {
  reply: string;
  mode: ChatMode;
  products?: ChatProductCard[];
}

export const chatApi = {
  send: (message: string, mode: ChatMode) =>
    api.post<ChatResponse>("/chat", { message, mode }),
};
