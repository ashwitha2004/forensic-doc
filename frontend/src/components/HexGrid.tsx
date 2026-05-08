
const HexGrid = () => {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 opacity-20">
        <svg
          width="100%"
          height="100%"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="hexagons"
              width="60"
              height="52"
              patternUnits="userSpaceOnUse"
              patternTransform="scale(1.5)"
            >
              <polygon
                points="30,5 50,15 50,35 30,45 10,35 10,15"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-cyan-500/30"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hexagons)" />
        </svg>
      </div>
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 opacity-90"></div>
    </div>
  );
};

export { HexGrid };
