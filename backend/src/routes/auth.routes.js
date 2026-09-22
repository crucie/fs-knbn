import { Router } from "express";
import {
  signup,
  login,
  googleAuth,
  me,
  setUsername,
  checkUsername,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/google", googleAuth);

router.get("/me", authenticate, me);
router.patch("/username", authenticate, setUsername);
router.get("/username-available", authenticate, checkUsername);

export default router;
