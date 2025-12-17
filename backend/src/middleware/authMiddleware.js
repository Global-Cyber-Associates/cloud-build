import jwt from "jsonwebtoken";

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ⭐ Normalize user object (multi-tenant safe)
    req.user = {
      id: decoded.id,
      role: decoded.role,
      email: decoded.email,
      tenantId: decoded.tenantId,
    };

    // ⭐ Enforce tenant context
    if (!req.user.tenantId) {
      return res.status(403).json({
        message: "Tenant context missing in token",
      });
    }

    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}
