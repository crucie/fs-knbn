import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Phone } from "lucide-react";
import api from "../lib/api";

const ICE = [{ urls: "stun:stun.l.google.com:19302" }];

/**
 * Voice channel room — mesh WebRTC via team SSE signaling.
 * `voiceEvent` is the latest voice.signal payload from the parent SSE bus.
 */
export default function VoiceRoom({
  projectId,
  channelId,
  currentUserId,
  currentUsername,
  voiceEvent,
}) {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [peers, setPeers] = useState([]); // { userId, username }
  const [error, setError] = useState("");

  const localStreamRef = useRef(null);
  const pcsRef = useRef(new Map()); // userId -> RTCPeerConnection
  const remoteAudioRef = useRef(new Map());
  const joinedRef = useRef(false);

  const signal = useCallback(
    async (body) => {
      await api.post(`/projects/${projectId}/channels/${channelId}/voice`, body);
    },
    [projectId, channelId]
  );

  const cleanupPeer = (userId) => {
    const pc = pcsRef.current.get(userId);
    if (pc) {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      pcsRef.current.delete(userId);
    }
    const audio = remoteAudioRef.current.get(userId);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
      remoteAudioRef.current.delete(userId);
    }
    setPeers((prev) => prev.filter((p) => p.userId !== userId));
  };

  const ensurePc = useCallback(
    (userId, username) => {
      if (pcsRef.current.has(userId)) return pcsRef.current.get(userId);
      const pc = new RTCPeerConnection({ iceServers: ICE });
      pcsRef.current.set(userId, pc);

      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          signal({
            kind: "ice",
            toUserId: userId,
            payload: ev.candidate,
          }).catch(() => {});
        }
      };

      pc.ontrack = (ev) => {
        let audio = remoteAudioRef.current.get(userId);
        if (!audio) {
          audio = document.createElement("audio");
          audio.autoplay = true;
          audio.playsInline = true;
          document.body.appendChild(audio);
          remoteAudioRef.current.set(userId, audio);
        }
        audio.srcObject = ev.streams[0];
      };

      setPeers((prev) =>
        prev.some((p) => p.userId === userId)
          ? prev
          : [...prev, { userId, username: username || "user" }]
      );

      return pc;
    },
    [signal]
  );

  const leave = useCallback(async () => {
    joinedRef.current = false;
    setJoined(false);
    try {
      await signal({ kind: "leave" });
    } catch {
      /* ignore */
    }
    for (const id of [...pcsRef.current.keys()]) cleanupPeer(id);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setPeers([]);
  }, [signal]);

  const join = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      localStreamRef.current = stream;
      joinedRef.current = true;
      setJoined(true);
      await signal({ kind: "join" });
    } catch (err) {
      setError(err.message || "Microphone access denied.");
    }
  };

  // Handle incoming voice signals from parent SSE
  useEffect(() => {
    if (!voiceEvent || voiceEvent.channelId !== channelId) return;
    if (voiceEvent.fromUserId === currentUserId) return;

    const run = async () => {
      const { kind, fromUserId, fromUsername, toUserId, payload } = voiceEvent;

      if (kind === "leave") {
        cleanupPeer(fromUserId);
        return;
      }

      if (!joinedRef.current) {
        if (kind === "join") {
          setPeers((prev) =>
            prev.some((p) => p.userId === fromUserId)
              ? prev
              : [...prev, { userId: fromUserId, username: fromUsername || "user" }]
          );
        }
        return;
      }

      if (kind === "join") {
        const pc = ensurePc(fromUserId, fromUsername);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await signal({
          kind: "offer",
          toUserId: fromUserId,
          payload: offer,
        });
        return;
      }

      if (toUserId && toUserId !== currentUserId) return;

      if (kind === "offer" && payload) {
        const pc = ensurePc(fromUserId, fromUsername);
        await pc.setRemoteDescription(payload);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await signal({
          kind: "answer",
          toUserId: fromUserId,
          payload: answer,
        });
      }

      if (kind === "answer" && payload) {
        const pc = pcsRef.current.get(fromUserId) || ensurePc(fromUserId, fromUsername);
        await pc.setRemoteDescription(payload);
      }

      if (kind === "ice" && payload) {
        const pc = pcsRef.current.get(fromUserId);
        if (pc) {
          try {
            await pc.addIceCandidate(payload);
          } catch {
            /* ignore */
          }
        }
      }
    };

    run().catch(() => {});
  }, [voiceEvent, channelId, currentUserId, ensurePc, signal]);

  useEffect(() => {
    return () => {
      leave();
    };
  }, [channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setMuted(next);
  };

  return (
    <div className="voice-room">
      <div className="voice-room-head">
        <h3>Voice channel</h3>
        <p className="meet-cal-sub">
          {joined
            ? "You’re connected — others in this channel can hear you."
            : "Join to talk with teammates in this audio channel."}
        </p>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="voice-peers">
        <div className={`voice-peer ${joined ? "live" : ""}`}>
          <span className="voice-avatar">{(currentUsername || "?").slice(0, 1).toUpperCase()}</span>
          <span>@{currentUsername || "you"} {joined ? (muted ? "(muted)" : "(you)") : ""}</span>
        </div>
        {peers.map((p) => (
          <div key={p.userId} className="voice-peer live">
            <span className="voice-avatar">{(p.username || "?").slice(0, 1).toUpperCase()}</span>
            <span>@{p.username}</span>
          </div>
        ))}
        {!joined && peers.length === 0 && (
          <p className="team-visibility-hint">No one in the call yet.</p>
        )}
      </div>

      <div className="voice-actions">
        {!joined ? (
          <button type="button" className="btn btn-solid" onClick={join}>
            <Phone size={15} /> Join voice
          </button>
        ) : (
          <>
            <button type="button" className="btn" onClick={toggleMute}>
              {muted ? <MicOff size={15} /> : <Mic size={15} />}
              {muted ? "Unmute" : "Mute"}
            </button>
            <button type="button" className="btn btn-danger" onClick={leave}>
              <PhoneOff size={15} /> Leave
            </button>
          </>
        )}
      </div>
    </div>
  );
}
