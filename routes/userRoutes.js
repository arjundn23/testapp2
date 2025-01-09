import express from "express";
import {
  authUser,
  logoutUser,
  getUserById,
  getUsers,
  updateUser,
  updateUserProfile,
  deleteUser,
  getUserProfile,
  registerUserAndGenerateLink,
  getUserByToken,
  updateTokenUserProfile,
  deactivateUser,
  forgetPassword,
  resetPassword,
} from "../controller/userController.js";
import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.route("/").get(getUsers);
router.route("/token-profile").put(updateTokenUserProfile);
router.post("/logout", logoutUser);
router.post("/auth", authUser);
router.post("/forget-password", forgetPassword);
router.post("/reset-password", resetPassword);
router
  .route("/profile")
  .get(protect,getUserProfile)
  .put(protect,updateUserProfile);
router.route("/deactivate/:id").put(protect,admin,deactivateUser);
router
  .route("/:id")
  .get(admin, getUserById)
  .put(protect,admin,updateUser)
  .delete(protect,admin,deleteUser);
router.post("/generate-link", protect, admin, registerUserAndGenerateLink);
router.route("/token-user/:token").get(getUserByToken);

export default router;
