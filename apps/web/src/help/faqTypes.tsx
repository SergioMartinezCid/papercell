import { Code, List, Table, Text } from '@mantine/core';
import type { ReactNode } from 'react';

export interface FaqItem {
  /** Stable id, to open the FAQ at this question. */
  id: string;
  question: string;
  answer: ReactNode;
}

export interface FaqSection {
  title: string;
  items: FaqItem[];
}

/** A paragraph of an answer. */
export function P({ children }: { children: ReactNode }) {
  return (
    <Text size="sm" mb="xs">
      {children}
    </Text>
  );
}

export function Items({ children }: { children: ReactNode }) {
  return (
    <List size="sm" spacing={4} mb="xs">
      {children}
    </List>
  );
}

/** A table of tokens: each row is the tokens and what they make. */
export function TokenTable({ head, rows }: { head: [string, string]; rows: Array<[string[], ReactNode]> }) {
  return (
    <Table withTableBorder withColumnBorders fz="sm" mb="xs" verticalSpacing={6}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{head[0]}</Table.Th>
          <Table.Th>{head[1]}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map(([tokens, meaning]) => (
          <Table.Tr key={tokens.join(' ')}>
            <Table.Td style={{ whiteSpace: 'nowrap' }}>
              {tokens.map((token, i) => (
                <span key={token}>
                  {i > 0 && ' '}
                  {/* Monospace fonts often lack ☐ or draw it tiny. */}
                  <Code style={/^\[/.test(token) ? undefined : { fontFamily: 'inherit', fontSize: '1.1em' }}>{token}</Code>
                </span>
              ))}
            </Table.Td>
            <Table.Td>{meaning}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
