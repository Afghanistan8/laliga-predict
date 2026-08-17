export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <p>
          LaLiga &apos;27 Predict · Built on{" "}
          <a href="https://genlayer.com" target="_blank" rel="noopener noreferrer">GenLayer</a>{" "}
          Bradbury · Testnet only — no real value.
        </p>
        <p className="footer-links">
          <a href="https://testnet-faucet.genlayer.foundation" target="_blank" rel="noopener noreferrer">Get test GEN ↗</a>
          <span className="footer-sep">·</span>
          <a href="https://docs.genlayer.com/developers/networks" target="_blank" rel="noopener noreferrer">Add Bradbury to wallet ↗</a>
          <span className="footer-sep">·</span>
          <a href="https://explorer-bradbury.genlayer.com" target="_blank" rel="noopener noreferrer">Explorer ↗</a>
        </p>
      </div>
    </footer>
  );
}
