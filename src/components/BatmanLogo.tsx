const BATMAN_SRC = "/logos/batman.png";

export function BatmanLogo() {
  return (
    <img
      src={BATMAN_SRC}
      alt=""
      className="batman-img"
      draggable={false}
    />
  );
}
