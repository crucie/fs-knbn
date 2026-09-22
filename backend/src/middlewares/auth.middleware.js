import { verifyToken } from "../utils/jwt.js";

export const authenticate = (req, res, next) => {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (typeof req.query.access_token === "string" && req.query.access_token) {
    // EventSource cannot set Authorization headers
    token = req.query.access_token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "Unauthorized: No token provided." });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Unauthorized: Invalid or expired token." });
  }
};
