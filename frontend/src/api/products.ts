import api from "./client";
import type { Product, PageResponse } from "../types";

export interface Category {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
}

export interface BestSeller {
  productId: number;
  name: string;
  description?: string;
  price: number;
  stock: number;
  cargoPrice: number;
  imageUrl?: string;
  categoryId?: number | null;
  categoryName?: string | null;
  totalSold: number;
  createdAt?: string;
}

export interface ProductQuery {
  search?: string;
  categoryId?: number;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort?: string;
  page?: number;
  size?: number;
}

function productQuery(params?: ProductQuery) {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.categoryId != null) query.set("categoryId", String(params.categoryId));
  if (params?.minPrice != null) query.set("minPrice", String(params.minPrice));
  if (params?.maxPrice != null) query.set("maxPrice", String(params.maxPrice));
  if (params?.inStock != null) query.set("inStock", String(params.inStock));
  if (params?.sort) query.set("sort", params.sort);
  query.set("page", String(params?.page ?? 0));
  query.set("size", String(params?.size ?? 12));
  return query.toString();
}

export function bestSellerToProduct(item: BestSeller): Product {
  return {
    id: item.productId,
    name: item.name,
    description: item.description ?? "",
    price: item.price,
    stock: item.stock,
    cargoPrice: item.cargoPrice ?? 0,
    imageUrl: item.imageUrl,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    category: item.categoryName,
    unitsSold: item.totalSold,
    createdAt: item.createdAt ?? "",
    updatedAt: item.createdAt ?? "",
  };
}

export const productApi = {
  getPage: (params?: ProductQuery) =>
    api.get<PageResponse<Product>>("/products?" + productQuery(params)),

  getAll: (params?: ProductQuery) =>
    api.get<PageResponse<Product>>("/products?" + productQuery({ size: 100, page: 0, ...params }))
      .then((res) => res.content),

  getById: (id: number) => api.get<Product>("/products/" + id),

  getRelated: (id: number) => api.get<Product[]>("/products/" + id + "/related"),

  getBestSellers: (limit = 8) =>
    api.get<BestSeller[]>("/products/best-sellers?limit=" + limit),

  getCategories: () => api.get<Category[]>("/categories"),

  createCategory: (data: { name: string; description?: string }) =>
    api.post<Category>("/admin/categories", data),

  updateCategory: (id: number, data: { name: string; description?: string }) =>
    api.put<Category>("/admin/categories/" + id, data),

  deleteCategory: (id: number) =>
    api.delete<void>("/admin/categories/" + id),

  // Admin: create product (JSON body, then separately upload image)
  create: (data: {
    name: string;
    description: string;
    price: number;
    stock: number;
    cargoPrice: number;
    categoryId?: number | null;
  }) => api.post<Product>("/admin/products", data),

  update: (
    id: number,
    data: {
      name: string;
      description: string;
      price: number;
      stock: number;
      cargoPrice: number;
      categoryId?: number | null;
    }
  ) => api.put<Product>("/admin/products/" + id, data),

  uploadImage: (id: number, formData: FormData) =>
    api.upload<Product>("/admin/products/" + id + "/image", formData),

  delete: (id: number) => api.delete<void>("/admin/products/" + id),
};
