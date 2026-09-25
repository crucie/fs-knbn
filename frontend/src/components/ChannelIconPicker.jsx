const ICONS = ["💬", "🔊", "📢", "🎯", "🚀", "🐛", "🎨", "📚", "💡", "🔒", "⭐", "🔥"];

export default function ChannelIconPicker({ value, onChange, disabled }) {
  return (
    <div className="channel-icon-picker" role="listbox" aria-label="Channel icon">
      <button
        type="button"
        className={`channel-icon-opt ${!value ? "active" : ""}`}
        onClick={() => onChange?.(null)}
        disabled={disabled}
        title="No icon"
      >
        #
      </button>
      {ICONS.map((icon) => (
        <button
          key={icon}
          type="button"
          className={`channel-icon-opt ${value === icon ? "active" : ""}`}
          onClick={() => onChange?.(icon)}
          disabled={disabled}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

export function ChannelGlyph({ channel, size = 14 }) {
  if (channel?.icon) {
    return <span className="channel-glyph-emoji" style={{ fontSize: size }}>{channel.icon}</span>;
  }
  if (channel?.type === "VOICE") {
    return <span className="channel-glyph-emoji" style={{ fontSize: size }}>🔊</span>;
  }
  return null;
}
