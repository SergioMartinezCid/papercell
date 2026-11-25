import { Code, List } from '@mantine/core';
import { Items, P, TokenTable, type FaqSection } from './faqTypes';

export const faqEn: FaqSection[] = [
  {
    title: 'The basics',
    items: [
      {
        id: 'what',
        question: 'What is Papercell for?',
        answer: (
          <>
            <P>
              For lists you keep in a spreadsheet but fill in on paper: checklists, stock counts, inspection rounds, sign-up sheets, meter
              readings, tallies, quick surveys.
            </P>
            <P>
              You print a range of the spreadsheet as a form, fill it in by hand, take a photo of it, and paste what was read back into the same
              cells.
            </P>
          </>
        ),
      },
      {
        id: 'privacy',
        question: 'Are my sheets or photos uploaded anywhere?',
        answer: (
          <>
            <P>No. Everything runs in your browser: sheets, photos and results stay on this device, and there is no account.</P>
            <P>
              Once loaded, the app works without a connection. Installing it (Install, or Add to Home screen, in your browser) keeps it at hand
              offline.
            </P>
          </>
        ),
      },
      {
        id: 'devices',
        question: 'Can I prepare a sheet on a computer and scan it with my phone?',
        answer: (
          <>
            <P>Yes. Every page carries a QR code that describes it, so any device can read any page, in any order.</P>
            <P>
              Only the device the sheet was printed from knows its text cells. There, the results can include the whole range. Elsewhere, they
              include what was read, and text cells are left empty.
            </P>
          </>
        ),
      },
    ],
  },
  {
    title: 'Preparing a sheet',
    items: [
      {
        id: 'cells',
        question: 'How does Papercell turn my cells into a page?',
        answer: (
          <>
            <Items>
              <List.Item>
                Cells with text are printed as they are, with their formatting: bold, italics, alignment, colours, font size, column widths, row
                heights and merged cells.
              </List.Item>
              <List.Item>Empty cells in rows that have some text become boxes to mark.</List.Item>
              <List.Item>Empty cells in rows without any text are left blank.</List.Item>
              <List.Item>The first rows without boxes, such as headers, are repeated at the top of every page if that setting is on.</List.Item>
            </Items>
            <P>
              Tokens, such as <Code>[##]</Code> for a number, change what a cell is (see the next question). A kind chosen by hand in the
              preview wins over everything else.
            </P>
          </>
        ),
      },
      {
        id: 'tokens',
        question: 'Which tokens can I use?',
        answer: (
          <>
            <TokenTable
              head={['Token', 'The cell becomes']}
              rows={[
                [['[ ]', '☐'], 'A box to mark.'],
                [['[-]'], 'Blank: printed empty, not read.'],
                [['[##]', '[###]'], 'A number, one box per digit (#), up to 12 digits. It can be written from the first box or ending in the last one.'],
                [
                  ['[#,#]', '[##.##]'],
                  'A number with decimals. The separator is printed between the boxes and kept in the value.',
                ],
                [
                  ['[___]', '[______]'],
                  'Capital letters (or digits), one box per letter (_), up to 40. Empty boxes between letters become a space.',
                ],
                [['[...]', '[…]'], 'A line to write anything on. It is not read: you type what is written while reviewing.'],
              ]}
            />
            <P>
              You can use <Code>0</Code> instead of <Code>#</Code>, as in <Code>[00]</Code> or <Code>[0,0]</Code>, but not mix the two in one
              token.
            </P>
          </>
        ),
      },
      {
        id: 'token-where',
        question: 'Where do I write a token?',
        answer: (
          <>
            <P>
              Either as the whole text of the cell, or anywhere in the cell's note (comment), where the first token counts. A token in a note keeps
              the cell itself empty, so it survives pasting the results over it, and the note can hold other text too.
            </P>
            <Items>
              <List.Item>Google Sheets, LibreOffice and ONLYOFFICE copy notes along with the cells.</List.Item>
              <List.Item>
                Excel does not seem to copy notes: write tokens in the cells, or upload the <Code>.xlsx</Code> file, whose notes are read.
              </List.Item>
              <List.Item>
                <Code>.csv</Code> and <Code>.tsv</Code> files have no notes.
              </List.Item>
            </Items>
          </>
        ),
      },
      {
        id: 'choose',
        question: 'Can I choose what a cell is without tokens?',
        answer: (
          <P>
            Yes. Click a cell without text in the preview and choose Box, Blank, Writing line, Letters (with how many) or Number (with its format,
            such as <Code>##</Code> or <Code>#,#</Code>). Your choice wins over tokens and is kept with the sheet.
          </P>
        ),
      },
      {
        id: 'hidden',
        question: 'What happens to hidden rows and columns?',
        answer: (
          <P>
            They keep their place in the range but are not printed, so the results paste back into the right cells. When Papercell cannot tell
            where they were, it says so: show them, copy again and hide them afterwards.
          </P>
        ),
      },
      {
        id: 'pages',
        question: 'Can a sheet have several pages?',
        answer: (
          <P>
            Yes. With Size set to Full width, the range fills the width of the paper and continues on as many pages as needed. One page shrinks it
            to fit a single page instead.
          </P>
        ),
      },
      {
        id: 'small',
        question: 'Papercell says the boxes are small. What can I do?',
        answer: (
          <P>
            Boxes, digits and letters need room to be written in and read. Try Landscape, Full width, taller rows or wider columns in the
            spreadsheet, or fewer rows. A range too large for one page code has to be split into smaller ranges.
          </P>
        ),
      },
    ],
  },
  {
    title: 'Filling it in',
    items: [
      {
        id: 'marks',
        question: 'How should I mark a box?',
        answer: (
          <P>
            Fill it in, or scribble over most of it, with a pen of any colour, and mark every box of the page the same way. A thin cross or a
            small tick may be too light to count, especially next to boxes filled in solidly.
          </P>
        ),
      },
      {
        id: 'write',
        question: 'How do I write numbers and letters?',
        answer: (
          <>
            <P>
              One digit or capital letter per box, inside the box. A number can start in the first box or end in the last one; a decimal
              separator is already printed.
            </P>
            <P>
              Letter fields read A–Z, Ñ and digits. Accented capitals are read as the plain letter, and small letters are not read. Leave a box
              empty for a space.
            </P>
          </>
        ),
      },
      {
        id: 'lines',
        question: 'What happens to what I write on a writing line?',
        answer: (
          <P>
            It is not read, because a model small enough to run on your device cannot read free handwriting reliably. Papercell only looks for
            writing on each line, and shows the lines with writing while reviewing, for you to type what they say.
          </P>
        ),
      },
    ],
  },
  {
    title: 'Scanning',
    items: [
      {
        id: 'photo',
        question: 'How do I take a good photo?',
        answer: (
          <P>
            One page per photo, flat, in good light and in focus, with its four corner squares and its QR code fully in the picture. Avoid flash
            glare and hard shadows. The page does not need to fill the photo or be perfectly straight.
          </P>
        ),
      },
      {
        id: 'fails',
        question: 'A page cannot be read. Why?',
        answer: (
          <Items>
            <List.Item>Corner squares not found: include the whole page and keep it flat.</List.Item>
            <List.Item>Page code not readable: take the photo closer or with more light. Papercell shows the part of the photo it tried.</List.Item>
            <List.Item>Printed with a newer version: reload the app to update it.</List.Item>
          </Items>
        ),
      },
      {
        id: 'check',
        question: 'What does "to check" mean?',
        answer: (
          <>
            <P>
              Papercell flags what it is not sure about instead of guessing: boxes close to the line between marked and empty, digits and letters
              read with low confidence, and lines with writing, for you to type it.
            </P>
            <P>
              Open Review and look at each one: press OK, or correct it. Anything else can be corrected too: tap a box to switch it, or a value to
              change it.
            </P>
          </>
        ),
      },
      {
        id: 'accuracy',
        question: 'How reliable is it?',
        answer: (
          <P>
            Boxes are very reliable. In reasonable photos, about 2 in 100 numbers and 3 in 100 letters come out wrong, and almost all of those are
            flagged to check. In dark or blurry photos more is flagged and a few mistakes are not, so retake poor photos and look over the results
            before pasting them.
          </P>
        ),
      },
      {
        id: 'order',
        question: 'Do I have to scan the pages in order?',
        answer: (
          <P>
            No. The pages of a sheet are grouped together in any order, and missing pages are listed. A new photo of a page replaces the earlier
            one. Scanned pages and your reviews stay on this device until you remove them.
          </P>
        ),
      },
      {
        id: 'updates',
        question: 'Will pages printed earlier still scan after an update?',
        answer: (
          <P>Yes. Each page records the print format it was made with, and new versions of Papercell keep reading every earlier format.</P>
        ),
      },
    ],
  },
  {
    title: 'Results',
    items: [
      {
        id: 'paste',
        question: 'Where do I paste the results?',
        answer: (
          <P>
            At the cell named under Results, in the same spreadsheet. It comes from "Range starts at", set when preparing. Copy puts the results on
            the clipboard ready to paste; Download CSV saves them as a file.
          </P>
        ),
      },
      {
        id: 'values',
        question: 'What do marked and empty boxes become?',
        answer: (
          <P>
            <Code>1</Code> for marked and nothing for empty, by default. Change Marked value and Empty value to anything else, such as{' '}
            <Code>x</Code> or <Code>TRUE</Code>.
          </P>
        ),
      },
      {
        id: 'block',
        question: 'What gets copied?',
        answer: (
          <Items>
            <List.Item>Boxes only: the smallest block that holds every box and field.</List.Item>
            <List.Item>Whole range: everything, text cells included (on the device the sheet was printed from).</List.Item>
            <List.Item>Selection: the cells you drag across, or tap first and last, in the table.</List.Item>
          </Items>
        ),
      },
    ],
  },
];
