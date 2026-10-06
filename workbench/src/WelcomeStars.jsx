// A fixed sky: no animation loop, random re-renders or external image download.
const stars = Array.from({ length: 210 }, (_, index) => {
  const fraction = value => value - Math.floor(value);
  const x = fraction(Math.sin(index * 127.1 + 19) * 43758.5453);
  const y = fraction(Math.sin(index * 311.7 + 71) * 19642.349);
  const brightness = fraction(Math.sin(index * 93.3 + 5) * 31821.713);
  return { x: x * 1600, y: y * 460,
    radius: brightness > .97 ? 1.05 : .35 + brightness * .35,
    opacity: (.12 + brightness * .66) * Math.pow(1 - y, 1.6) };
});

export default function WelcomeStars() {
  return <svg className="welcome-stars" viewBox="0 0 1600 460" preserveAspectRatio="xMidYMin slice"
    aria-hidden="true" focusable="false">
    {stars.map((star, index) => <circle key={index} cx={star.x} cy={star.y}
      r={star.radius} fill="#fff" opacity={star.opacity} />)}
  </svg>;
}
