package com.ecomerce.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CategoryRequest {

    @NotBlank(message = "Category name is required")
    @Size(max = 80, message = "Category name must be 80 characters or less")
    private String name;

    @Size(max = 500, message = "Description must be 500 characters or less")
    private String description;
}
