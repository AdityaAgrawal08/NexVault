import { evaluatePasswordStrength } from "@/shared/utils/passwordStrength";

interface Props {
  password: string;
}

const colorMap = ["#e74c3c", "#e67e22", "#f1c40f", "#2ecc71", "#27ae60"];

export default function PasswordStrengthBar({ password }: Props) {
  if (!password) return null;

  const { score, label, failures } = evaluatePasswordStrength(password);

  return (
    <div className="strength-bar-wrapper">
      <div className="strength-bar-track">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="strength-bar-segment"
            style={{
              backgroundColor: i <= score ? colorMap[score] : "#ddd",
            }}
          />
        ))}
      </div>
      <span className="strength-label" style={{ color: colorMap[score] }}>
        {label}
      </span>
      {failures.length > 0 && (
        <ul className="strength-failures">
          {failures.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
