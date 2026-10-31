import { drawingToSvg, type PrintableSheet } from '@papercell/core';
import { useMemo } from 'react';
import { createPortal } from 'react-dom';

/** The pages exactly as printed: hidden on screen, the only thing visible when printing. */
export function PrintRoot({ printable }: { printable: PrintableSheet }) {
  const { format } = printable.layout;
  const pages = useMemo(() => printable.pages.map((p, i) => drawingToSvg(p.drawing, `p${i}-`)), [printable]);
  const size = `${format.paper === 'a4' ? 'A4' : 'letter'} ${format.orientation}`;
  return createPortal(
    <div id="print-root">
      <style>{`@page { size: ${size}; margin: 0; }`}</style>
      {pages.map((svg, i) => (
        <div key={i} className="print-page" style={{ width: `${format.width}mm`, height: `${format.height}mm` }} dangerouslySetInnerHTML={{ __html: svg }} />
      ))}
    </div>,
    document.body,
  );
}
