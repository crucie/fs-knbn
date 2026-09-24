import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getSettings,
  updateSettings,
  setBlockedDate,
  refreshPrivateInvite,
  getOwnerDaySlots,
  getPublicProfile,
  getPublicMonth,
  getPublicDaySlots,
  getPublicSlot,
  createPublicBooking,
  getPrivateInvite,
} from "../controllers/calendar.controller.js";

const router = Router();

/* Public booking (no auth) */
router.get("/public/:username", getPublicProfile);
router.get("/public/:username/month", getPublicMonth);
router.get("/public/:username/slots", getPublicDaySlots);
router.get("/public/:username/slot/:slotSlug", getPublicSlot);
router.get("/public/:username/private/:token", getPrivateInvite);
router.post("/public/:username/book", createPublicBooking);

/* Owner */
router.use(authenticate);

router.get("/settings", getSettings);
router.patch("/settings", updateSettings);
router.post("/blocked-dates", setBlockedDate);
router.post("/private-invite", refreshPrivateInvite);
router.get("/slots", getOwnerDaySlots);

router.get("/events", listEvents);
router.post("/events", createEvent);
router.patch("/events/:eventId", updateEvent);
router.delete("/events/:eventId", deleteEvent);

export default router;
