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
  searchUsers,
} from "../controller/userController.js";
import { sendSupportEmail } from "../controller/supportController.js";
import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.route("/").get(protect,admin,getUsers);
router.route("/token-profile").put(updateTokenUserProfile);
router.get("/search", protect, searchUsers);
router.post("/logout", protect, logoutUser);
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
  .get(protect,admin,getUserById)
  .put(protect,admin,updateUser)
  .delete(protect,admin,deleteUser);
router.post("/generate-link", protect, admin, registerUserAndGenerateLink);
router.route("/token-user/:token").get(getUserByToken);

// Support route
router.post("/support", protect, sendSupportEmail);

export default router;
