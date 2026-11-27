import { Code, List } from '@mantine/core';
import { Items, P, TokenTable, type FaqSection } from './faqTypes';

export const faqEs: FaqSection[] = [
  {
    title: 'Lo básico',
    items: [
      {
        id: 'what',
        question: '¿Para qué sirve Papercell?',
        answer: (
          <>
            <P>
              Para listas que llevas en una hoja de cálculo pero rellenas en papel: listas de comprobación, recuentos de material, rondas de
              revisión, hojas de inscripción, lecturas de contadores, recuentos o encuestas rápidas.
            </P>
            <P>
              Imprimes un rango de la hoja de cálculo como formulario, lo rellenas a mano, le haces una foto y pegas lo leído en las mismas celdas.
            </P>
          </>
        ),
      },
      {
        id: 'privacy',
        question: '¿Se suben mis hojas o mis fotos a algún sitio?',
        answer: (
          <>
            <P>No. Todo funciona en tu navegador: las hojas, las fotos y los resultados se quedan en este dispositivo, y no hay cuenta.</P>
            <P>
              Una vez cargada, la aplicación funciona sin conexión. Si la instalas (Instalar, o Añadir a la pantalla de inicio, en tu navegador),
              la tendrás a mano también sin conexión.
            </P>
          </>
        ),
      },
      {
        id: 'devices',
        question: '¿Puedo preparar una hoja en el ordenador y escanearla con el móvil?',
        answer: (
          <>
            <P>Sí. Cada página lleva un código QR que la describe, así que cualquier dispositivo puede leer cualquier página, en cualquier orden.</P>
            <P>
              Solo el dispositivo desde el que se imprimió la hoja conoce sus celdas de texto. En él, los resultados pueden incluir el rango
              entero. En los demás, incluyen lo leído, y las celdas de texto quedan vacías.
            </P>
          </>
        ),
      },
    ],
  },
  {
    title: 'Preparar una hoja',
    items: [
      {
        id: 'cells',
        question: '¿Cómo convierte Papercell mis celdas en una página?',
        answer: (
          <>
            <Items>
              <List.Item>
                Las celdas con texto se imprimen tal cual, con su formato: negrita, cursiva, alineación, colores, tamaño de letra, ancho de
                columnas, alto de filas y celdas combinadas.
              </List.Item>
              <List.Item>Las celdas vacías de filas que tienen algún texto se convierten en casillas para marcar.</List.Item>
              <List.Item>Las celdas vacías de filas sin ningún texto quedan en blanco.</List.Item>
              <List.Item>
                Las primeras filas sin casillas, como las cabeceras, se repiten arriba en cada página si esa opción está activada.
              </List.Item>
            </Items>
            <P>
              Las etiquetas, como <Code>[##]</Code> para un número, cambian lo que es una celda (mira la pregunta siguiente). Lo que elijas a mano
              en la vista previa manda sobre todo lo demás.
            </P>
          </>
        ),
      },
      {
        id: 'tokens',
        question: '¿Qué etiquetas puedo usar?',
        answer: (
          <>
            <TokenTable
              head={['Etiqueta', 'La celda se convierte en']}
              rows={[
                [['[ ]', '☐'], 'Una casilla para marcar.'],
                [['[-]'], 'En blanco: se imprime vacía y no se lee.'],
                [
                  ['[##]', '[###]'],
                  'Un número, una casilla por cifra (#), hasta 12 cifras. Se puede escribir desde la primera casilla o terminando en la última.',
                ],
                [
                  ['[#,#]', '[##.##]'],
                  'Un número con decimales. El separador se imprime entre las casillas y se mantiene en el valor.',
                ],
                [
                  ['[___]', '[______]'],
                  'Letras mayúsculas (o cifras), una casilla por letra (_), hasta 40. Las casillas vacías entre letras se convierten en un espacio.',
                ],
                [['[...]', '[…]'], 'Una línea para escribir lo que sea. No se lee: escribes lo que pone al revisar.'],
              ]}
            />
            <P>
              Puedes usar <Code>0</Code> en lugar de <Code>#</Code>, como en <Code>[00]</Code> o <Code>[0,0]</Code>, pero sin mezclar los dos en
              una misma etiqueta.
            </P>
          </>
        ),
      },
      {
        id: 'token-where',
        question: '¿Dónde escribo una etiqueta?',
        answer: (
          <>
            <P>
              Como texto completo de la celda, o en cualquier parte de su nota (comentario), donde cuenta la primera etiqueta. Una etiqueta en una
              nota deja la celda vacía, así que sigue ahí aunque pegues los resultados encima, y la nota puede tener más texto.
            </P>
            <Items>
              <List.Item>Google Sheets, LibreOffice y ONLYOFFICE copian las notas junto con las celdas.</List.Item>
              <List.Item>
                Excel no copia las notas: escribe las etiquetas en las celdas, o sube el archivo <Code>.xlsx</Code>, cuyas notas sí se leen.
              </List.Item>
              <List.Item>
                Los archivos <Code>.csv</Code> y <Code>.tsv</Code> no tienen notas.
              </List.Item>
            </Items>
          </>
        ),
      },
      {
        id: 'choose',
        question: '¿Puedo elegir lo que es una celda sin etiquetas?',
        answer: (
          <P>
            Sí. Haz clic en una celda sin texto en la vista previa y elige Casilla, En blanco, Línea para escribir, Letras (con cuántas) o Número
            (con su formato, como <Code>##</Code> o <Code>#,#</Code>). Lo que elijas manda sobre las etiquetas y se guarda con la hoja.
          </P>
        ),
      },
      {
        id: 'hidden',
        question: '¿Qué pasa con las filas y columnas ocultas?',
        answer: (
          <P>
            Mantienen su sitio en el rango pero no se imprimen, así que los resultados se pegan en las celdas correctas. Si Papercell no puede
            saber dónde estaban, te lo dice: muéstralas, vuelve a copiar y ocúltalas después.
          </P>
        ),
      },
      {
        id: 'pages',
        question: '¿Una hoja puede tener varias páginas?',
        answer: (
          <P>
            Sí. Con Tamaño en Ancho completo, el rango ocupa el ancho del papel y sigue en tantas páginas como haga falta. Una página, en cambio,
            lo reduce para que quepa en una sola.
          </P>
        ),
      },
      {
        id: 'small',
        question: 'Papercell dice que las casillas son pequeñas. ¿Qué hago?',
        answer: (
          <P>
            Las casillas, cifras y letras necesitan sitio para escribirse y leerse. Prueba con Horizontal, Ancho completo, filas más altas o
            columnas más anchas en la hoja de cálculo, o con menos filas. Un rango demasiado grande para un código de página hay que dividirlo en
            rangos más pequeños.
          </P>
        ),
      },
    ],
  },
  {
    title: 'Rellenarla',
    items: [
      {
        id: 'marks',
        question: '¿Cómo marco una casilla?',
        answer: (
          <P>
            Rellénala, táchala o haz en ella un ✓ o una cruz bien visibles, con un bolígrafo de cualquier color. Puedes mezclar ✓, cruces y
            casillas rellenas en la misma página. Una marca muy tenue o muy pequeña puede quedar señalada para que la compruebes.
          </P>
        ),
      },
      {
        id: 'write',
        question: '¿Cómo escribo números y letras?',
        answer: (
          <>
            <P>
              Una cifra o letra mayúscula por casilla, dentro de la casilla. Un número puede empezar en la primera casilla o terminar en la última;
              el separador decimal ya viene impreso.
            </P>
            <P>
              Los campos de letras leen A–Z, Ñ y cifras. Las mayúsculas con tilde se leen como la letra sin tilde, y las minúsculas no se leen.
              Deja una casilla vacía para un espacio.
            </P>
          </>
        ),
      },
      {
        id: 'lines',
        question: '¿Qué pasa con lo que escribo en una línea para escribir?',
        answer: (
          <P>
            No se lee, porque un modelo lo bastante pequeño para funcionar en tu dispositivo no lee bien la letra libre. Papercell solo mira si
            hay algo escrito en cada línea, y al revisar te muestra las líneas escritas para que escribas lo que pone.
          </P>
        ),
      },
    ],
  },
  {
    title: 'Escanear',
    items: [
      {
        id: 'photo',
        question: '¿Cómo hago una buena foto?',
        answer: (
          <P>
            Una página por foto, plana, con buena luz y enfocada, con sus cuatro cuadrados de las esquinas y su código QR enteros en la imagen.
            Evita los reflejos del flash y las sombras marcadas. No hace falta que la página llene la foto ni que esté perfectamente recta.
          </P>
        ),
      },
      {
        id: 'fails',
        question: 'No se puede leer una página. ¿Por qué?',
        answer: (
          <Items>
            <List.Item>No se encuentran los cuadrados de las esquinas: incluye la página entera y mantenla plana.</List.Item>
            <List.Item>
              No se puede leer el código de la página: haz la foto más cerca o con más luz. Papercell muestra la parte de la foto que ha probado.
            </List.Item>
            <List.Item>Impresa con una versión más nueva: recarga la aplicación para actualizarla.</List.Item>
          </Items>
        ),
      },
      {
        id: 'check',
        question: '¿Qué significa «por revisar»?',
        answer: (
          <>
            <P>
              Papercell señala aquello de lo que no está seguro en vez de adivinar: casillas cerca del límite entre marcada y vacía, cifras y letras
              leídas con poca confianza, y líneas con algo escrito, para que lo escribas tú.
            </P>
            <P>
              Abre Revisar y mira cada una: pulsa OK o corrígela. Todo lo demás también se puede corregir: toca una casilla para cambiarla, o un
              valor para modificarlo.
            </P>
          </>
        ),
      },
      {
        id: 'accuracy',
        question: '¿Es fiable?',
        answer: (
          <P>
            Las casillas, mucho. En fotos razonables, salen mal unos 2 de cada 100 números y 3 de cada 100 letras, y casi todos quedan señalados
            por revisar. En fotos oscuras o borrosas se señala más y algunos errores no, así que repite las fotos malas y repasa los resultados
            antes de pegarlos.
          </P>
        ),
      },
      {
        id: 'order',
        question: '¿Tengo que escanear las páginas en orden?',
        answer: (
          <P>
            No. Las páginas de una hoja se agrupan en cualquier orden, y se indica cuáles faltan. Una foto nueva de una página sustituye a la
            anterior. Las páginas escaneadas y tus revisiones se quedan en este dispositivo hasta que las quites.
          </P>
        ),
      },
      {
        id: 'updates',
        question: '¿Las páginas impresas antes se seguirán leyendo tras una actualización?',
        answer: (
          <P>Sí. Cada página indica el formato de impresión con el que se hizo, y las versiones nuevas de Papercell siguen leyendo todos los anteriores.</P>
        ),
      },
    ],
  },
  {
    title: 'Resultados',
    items: [
      {
        id: 'paste',
        question: '¿Dónde pego los resultados?',
        answer: (
          <P>
            En la celda que se indica en Resultados, en la misma hoja de cálculo. Sale de «El rango empieza en», que se pone al preparar (al
            subir un archivo <Code>.xlsx</Code> se pone sola). Copiar deja los resultados en el portapapeles listos para pegar; Descargar CSV los
            guarda en un archivo.
          </P>
        ),
      },
      {
        id: 'share',
        question: '¿Cómo paso los resultados del móvil al ordenador?',
        answer: (
          <P>
            Usa Compartir, bajo los resultados, para enviarlos a una app de notas o a un correo, con la celda donde pegarlos como título o asunto.
            Como texto, se pegan directamente en la hoja de cálculo desde la nota. Como archivo CSV, aguantan también el correo, que puede
            convertir en espacios los tabuladores entre celdas. Compartir aparece donde el dispositivo lo permite, como en los móviles.
          </P>
        ),
      },
      {
        id: 'values',
        question: '¿En qué se convierten las casillas marcadas y vacías?',
        answer: (
          <P>
            En <Code>1</Code> las marcadas y en nada las vacías, de forma predeterminada. Cambia Valor si marcada y Valor si vacía por lo
            que quieras, como <Code>x</Code> o <Code>VERDADERO</Code>.
          </P>
        ),
      },
      {
        id: 'block',
        question: '¿Qué se copia?',
        answer: (
          <Items>
            <List.Item>Solo casillas: el bloque más pequeño que contiene todas las casillas y campos.</List.Item>
            <List.Item>Rango completo: todo, también las celdas de texto (en el dispositivo desde el que se imprimió la hoja).</List.Item>
            <List.Item>Selección: las celdas que arrastres, o cuya primera y última toques, en la tabla.</List.Item>
          </Items>
        ),
      },
    ],
  },
];
