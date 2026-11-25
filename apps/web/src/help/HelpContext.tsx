import { createContext, useContext } from 'react';

export interface Help {
  /** Opens the questions and answers, at `question` if given. */
  openFaq: (question?: string) => void;
  startTour: () => void;
}

export const HelpContext = createContext<Help>({ openFaq: () => undefined, startTour: () => undefined });

export function useHelp(): Help {
  return useContext(HelpContext);
}
