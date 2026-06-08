const JOKER_SRC = "/logos/joker.png";

export function JokerLogo() {
  return (
    <img
      src={JOKER_SRC}
      alt=""
      className="joker-img"
      draggable={false}
    />
  );
}
