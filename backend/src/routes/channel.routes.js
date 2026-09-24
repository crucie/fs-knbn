import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import {
  isProjectMember,
  isProjectMaintainer,
} from "../middlewares/prjAccess.middleware.js";
import {
  listChannels,
  createChannel,
  openDm,
  deleteChannel,
  updateChannel,
  leaveChannel,
  reorderChannels,
  listMessages,
  postMessage,
  teamLiveStream,
  voiceSignal,
} from "../controllers/channel.controller.js";

const router = Router({ mergeParams: true });

router.use(authenticate, isProjectMember);

router.get("/stream", teamLiveStream);
router.get("/", listChannels);
router.post("/", createChannel);
router.post("/dm", openDm);
router.patch("/reorder", reorderChannels);
router.patch("/:channelId", updateChannel);
router.post("/:channelId/leave", leaveChannel);
router.post("/:channelId/voice", voiceSignal);
router.delete("/:channelId", isProjectMaintainer, deleteChannel);

router.get("/:channelId/messages", listMessages);
router.post("/:channelId/messages", postMessage);

export default router;
