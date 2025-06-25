import express from "express";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  updateCategoryOrder,
} from "../controller/categoryController.js";
import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.route("/")
  .get(protect, getCategories)
  .post(protect, admin, createCategory);

router.route("/reorder")
  .put(protect, admin, updateCategoryOrder);

router.route("/:id")
  .put(protect, admin, updateCategory)
  .delete(protect, admin, deleteCategory);

export default router;
