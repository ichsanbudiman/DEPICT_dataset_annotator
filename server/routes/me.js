// Who the browser is talking to. The app asks once at boot.
import { Router } from "express";

export const me = Router();

me.get("/", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "not_signed_in" });
  res.json({
    id: req.user.id,
    name: req.user.name,
    role: req.user.role,
    isOwner: req.user.role === "owner",
    canWrite: true
  });
});
