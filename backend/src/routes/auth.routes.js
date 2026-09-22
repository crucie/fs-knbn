import { Router } from "express";
import {
  signup,
  login,
  googleAuth,
  me,
  setUsername,
  checkUsername,
  updateProfile,
} from "../controllers/auth.controller.js";
import {
  oauthStatus,
  googleAuthUrl,
  googleCallback,
  githubAuthUrl,
  githubCallback,
  unlinkGithub,
} from "../controllers/oauth.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/google", googleAuth);

router.get("/oauth/status", oauthStatus);

router.get("/google/url", googleAuthUrl);
router.get("/google/callback", googleCallback);
router.get("/google/connect-url", authenticate, (req, res, next) => {
  req.oauthMode = "link";
  return googleAuthUrl(req, res, next);
});

router.get("/github/url", githubAuthUrl);
router.get("/github/callback", githubCallback);
router.get("/github/connect-url", authenticate, (req, res, next) => {
  req.oauthMode = "link";
  return githubAuthUrl(req, res, next);
});
router.delete("/github", authenticate, unlinkGithub);

router.post("/github-app/identity", authenticate, async (req, res, next) => {
  const { linkGithubAppIdentity } = await import("../controllers/github.controller.js");
  return linkGithubAppIdentity(req, res, next);
});

router.get("/me", authenticate, me);
router.patch("/username", authenticate, setUsername);
router.patch("/profile", authenticate, updateProfile);
router.get("/username-available", authenticate, checkUsername);

export default router;
