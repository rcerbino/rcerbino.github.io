# -*- coding: utf-8 -*-
"""Italian and German versions of the DDM landing page (/ddm/it/, /ddm/de/), built from landing.src.html by
replacing its text, word for word as listed here. The application pages stay in English.

Every English text must be found in the landing page, or the build stops: after a change to the English text, update
the tables. Text nodes are matched whole (between two tags), aria-labels whole; RAW entries are plain replacements for
the few places where a sentence runs across a link. Accents and umlauts are written as HTML entities in the output."""
import html
import re

# text nodes (between tags) and aria-labels, English -> translation
TEXT = {
    "it": {
        "Differential dynamic microscopy": "Microscopia dinamica differenziale",
        "DDM, hands on": "DDM, in pratica",
        "(DDM), introduced in 2008 (R. Cerbino and V. Trappe,": "(DDM), introdotta nel 2008 (R. Cerbino e V. Trappe,",
        "), turns an ordinary microscope movie into a light scattering experiment: it measures how fast the patterns of each size in the image fade, without following any single particle or cell. From those rates follow sizes, speeds and much more. Each page below simulates an experiment in your browser and takes you through the whole analysis, from the raw movie to the result.":
            "), trasforma un normale filmato al microscopio in un esperimento di diffusione della luce: misura quanto in fretta svaniscono i motivi di ogni dimensione nell'immagine, senza seguire nessuna singola particella o cellula. Da questo si ricavano dimensioni, velocità e molto altro. Ogni pagina qui sotto simula un esperimento nel tuo browser e ti accompagna in tutta l'analisi, dal filmato grezzo al risultato. Le pagine delle applicazioni sono in inglese.",
        "New here?": "Prima volta qui?",
        "Try doubling the bead size": "Prova a raddoppiare la dimensione delle sfere",
        ": predict how the curves move, then watch the page check it. Teaching DDM?": ": prevedi come si spostano le curve, poi guarda la pagina verificarlo. Insegni la DDM?",
        "Exercises with model answers": "Esercizi con soluzioni",
        "for every page, printable.": "per ogni pagina, stampabili.",
        "Brownian motion": "Moto browniano",
        "How big are they?": "Quanto sono grandi?",
        "Bright field, colloidal beads (sketch)": "Campo chiaro, sfere colloidali (schizzo)",
        "Size colloidal particles from how fast they wander, as in dynamic light scattering, but with a microscope and in samples where light scattering struggles.":
            "Misura la dimensione di particelle colloidali da quanto in fretta vagano, come nella diffusione dinamica della luce, ma con un microscopio e in campioni in cui la diffusione della luce è in difficoltà.",
        "Spheres, ellipsoids and rods, some of which turn as well as wander; seven imaging modes from bright field to confocal; cameras, noise, depth of field and what each does to the result.":
            "Sfere, ellissoidi e bastoncini, alcuni dei quali ruotano oltre a vagare; sette modalità di imaging, dal campo chiaro al confocale; telecamere, rumore, profondità di campo e l'effetto di ciascuno sul risultato.",
        "Diffusion": "Diffusione", "Particle size": "Dimensione delle particelle", "Rotation": "Rotazione",
        "Open Sizing particles": "Apri Sizing particles (in inglese)",
        "Active motion": "Moto attivo",
        "How fast do they swim?": "Quanto nuotano veloci?",
        "Phase contrast, bacteria (sketch)": "Contrasto di fase, batteri (schizzo)",
        "Measure how fast bacteria, algae or sperm swim, how much the speeds spread and which share of the cells swims, from a motility movie with thousands of cells.":
            "Misura quanto velocemente nuotano batteri, alghe o spermatozoi, quanto variano le velocità e quale parte delle cellule nuota, da un filmato di motilità con migliaia di cellule.",
        "E. coli strains, Salmonella, B. subtilis, Chlamydomonas, Euglena and bull sperm, set up as in published experiments, or cells of your own design.":
            "Ceppi di E. coli, Salmonella, B. subtilis, Chlamydomonas, Euglena e spermatozoi bovini, impostati come in esperimenti pubblicati, o cellule progettate da te.",
        "Swimming speed": "Velocità di nuoto", "Speed spread": "Dispersione delle velocità", "Share of swimmers": "Frazione di nuotatori",
        "Open Swimming cells": "Apri Swimming cells (in inglese)",
        "Drift": "Deriva",
        "Where are they going?": "Dove stanno andando?",
        "Bright field, beads in a flow (sketch)": "Campo chiaro, sfere in un flusso (schizzo)",
        "Measure the speed and direction of particles carried by a flow, by gravity or by a temperature gradient, while they keep jiggling, and find out how slow a drift a movie can still show.":
            "Misura velocità e direzione di particelle trasportate da un flusso, dalla gravità o da un gradiente di temperatura mentre continuano ad agitarsi, e scopri quanto lenta può essere una deriva perché un filmato la mostri ancora.",
        "Plug and channel flows; sedimentation with the microscope upright or on its side; thermophoresis of polystyrene beads with Soret coefficients from published measurements.":
            "Flussi uniformi e in canale; sedimentazione con il microscopio dritto o sul fianco; termoforesi di sfere di polistirene con coefficienti di Soret da misure pubblicate.",
        "Flow": "Flusso", "Sedimentation": "Sedimentazione", "Thermophoresis": "Termoforesi",
        "Open Drifting particles": "Apri Drifting particles (in inglese)",
        "Viscoelasticity": "Viscoelasticità",
        "Liquid or solid?": "Liquido o solido?",
        "Bright field, beads in a gel (sketch)": "Campo chiaro, sfere in un gel (schizzo)",
        "Measure how elastic and how viscous a soft material is, from how far tracer beads mixed into it get: microrheology with a microscope, from a drop of sample.":
            "Misura quanto è elastico e quanto è viscoso un materiale soffice, da quanto si allontanano le sfere traccianti mescolate al suo interno: microreologia con un microscopio, da una goccia di campione.",
        "Simple liquids, wormlike micelles, polymer solutions and a gel forming, with moduli known exactly; from the movie to G' and G'' over several decades of frequency.":
            "Liquidi semplici, micelle vermiformi, soluzioni polimeriche e un gel che si forma, con moduli noti esattamente; dal filmato a G' e G'' su diverse decadi di frequenza.",
        "Microrheology": "Microreologia", "G' and G''": "G' e G''", "Gelation": "Gelificazione",
        "Open Liquid or solid": "Apri Liquid or solid (in inglese)",
        "Interactions": "Interazioni",
        "How do they arrange in a crowd?": "Come si dispongono nella folla?",
        "Confocal, concentrated colloids (sketch)": "Confocale, colloidi concentrati (schizzo)",
        "Measure how particles that push each other arrange themselves, and how the crowd moves, from a confocal movie: the structure factor and collective diffusion, as in light scattering.":
            "Misura come si dispongono particelle che si spingono a vicenda, e come si muove la folla, da un filmato confocale: il fattore di struttura e la diffusione collettiva, come nella diffusione della luce.",
        "Hard and charged spheres from dilute to 45 % of the volume, all dyed or only a few; the particles are simulated pushing each other, so what DDM finds is checked against what they really do.":
            "Sfere dure e cariche, da diluite fino al 45 % del volume, tutte colorate o solo alcune; nella simulazione le particelle si spingono davvero, così ciò che trova la DDM si confronta con ciò che fanno realmente.",
        "Structure factor": "Fattore di struttura", "Collective diffusion": "Diffusione collettiva", "Self diffusion": "Autodiffusione",
        "Open Crowded particles": "Apri Crowded particles (in inglese)",
        "Proteins": "Proteine",
        "Do they attract or repel?": "Si attraggono o si respingono?",
        "Bright field, a protein solution (sketch, contrast stretched)": "Campo chiaro, una soluzione di proteine (schizzo, contrasto aumentato)",
        "Measure the size of proteins far too small to see, and whether they repel or attract each other, from bright-field movies at a few concentrations: the diffusion interaction parameter k":
            "Misura la dimensione di proteine troppo piccole per essere viste, e se si respingono o si attraggono, da filmati in campo chiaro a poche concentrazioni: il parametro di interazione diffusiva k",
        "and the second virial coefficient B": "e il secondo coefficiente del viriale B",
        "An antibody in low and high salt, albumin, lysozyme and a sticky antibody, or a protein of your own: set its charge and the salt, and see how both numbers follow.":
            "Un anticorpo con poco e con molto sale, l'albumina, il lisozima e un anticorpo appiccicoso, o una proteina tua: imposta la sua carica e il sale, e guarda come cambiano i due numeri.",
        "Protein size": "Dimensione delle proteine",
        "Open Proteins": "Apri Proteins (in inglese)",
        "Yielding": "Snervamento",
        "When does it start to flow?": "Quando comincia a scorrere?",
        "Bright field, beads in a sheared gel (sketch)": "Campo chiaro, sfere in un gel sotto taglio (schizzo)",
        "Shear a soft material back and forth and compare frames taken one full cycle apart: what the shear undoes cancels, and the rearrangements it leaves behind show when a soft solid yields and starts to flow.":
            "Deforma un materiale soffice avanti e indietro e confronta fotogrammi presi a un ciclo intero di distanza: ciò che il taglio annulla si cancella, e i riarrangiamenti che lascia dietro di sé mostrano quando un solido soffice cede e comincia a scorrere.",
        "A yield-stress microgel below and above its yield point, a rubber and a viscous liquid; a strain sweep from 5 % to 150 %, as in our echo-DDM experiments.":
            "Un microgel con soglia di snervamento, sotto e sopra lo snervamento, una gomma e un liquido viscoso; una scansione in deformazione dal 5 % al 150 %, come nei nostri esperimenti di echo-DDM.",
        "Oscillatory shear": "Taglio oscillatorio",
        "Open Sheared materials": "Apri Sheared materials (in inglese)",
        "Collective motion": "Moto collettivo",
        "Jammed, flowing or flocking?": "Bloccato, fluido o in stormo?",
        "Fluorescence, nuclei of a cell sheet (sketch)": "Fluorescenza, nuclei di uno strato di cellule (schizzo)",
        "Tell whether a sheet of epithelial cells is stuck like a solid, flows like a liquid or moves as a flock, from a time-lapse of their stained nuclei, without following any cell.":
            "Capisci se uno strato di cellule epiteliali è bloccato come un solido, scorre come un liquido o si muove come uno stormo, da un time-lapse dei loro nuclei colorati, senza seguire nessuna cellula.",
        "Crawling cells that push each other and steer together: jammed sheets, fluid ones, flocking solids and flocking liquids, as in our studies of reawakened epithelia; the rate of each pattern, and the network of nuclei followed cell by cell.":
            "Cellule che strisciano, si spingono e si orientano insieme: strati bloccati, strati fluidi, solidi e liquidi in stormo, come nei nostri studi sugli epiteli risvegliati; la velocità di ogni motivo e la rete dei nuclei seguita cellula per cellula.",
        "Start here": "Da dove cominciare",
        "Pause the animations": "Ferma le animazioni", "Skip to the content": "Vai al contenuto", "Play the animations": "Riavvia le animazioni",
        "How DDM works, step by step, from the raw movie to the size of a particle. The other pages build on it.": "Come funziona la DDM, passo dopo passo, dal filmato grezzo alla dimensione di una particella. Le altre pagine partono da qui.",
        "Classic applications": "Applicazioni classiche",
        "Established uses of DDM, each about one kind of motion: swimming, drifting, and beads jiggling in a soft material.": "Usi consolidati della DDM, ognuno su un tipo di moto: nuotare, derivare, e sfere che si agitano in un materiale soffice.",
        "Advanced applications": "Applicazioni avanzate",
        "Newer methods, closer to current research: particles that push each other, proteins too small to see, materials under shear and moving tissues. They take the first page for granted.": "Metodi più recenti, vicini alla ricerca di oggi: particelle che si spingono, proteine troppo piccole per essere viste, materiali sotto taglio e tessuti in movimento. Danno per scontata la prima pagina.",
        "Teaching and practice": "Per insegnare ed esercitarsi",
        "Exercises and notebooks": "Esercizi e notebook",
        "Questions with model answers for every page, to predict, compute and discuss, printable for a class or for study on your own.": "Domande con soluzioni per ogni pagina, per prevedere, calcolare e discutere, stampabili per una lezione o per studiare da soli.",
        "Every page lets you download the movie it simulated, and several link a Python notebook, to run the analysis yourself, with fastDDM or a few lines of numpy.": "Ogni pagina permette di scaricare il filmato che ha simulato, e diverse rimandano a un notebook Python, per rifare l'analisi da soli, con fastDDM o poche righe di numpy.",
        "Exercises": "Esercizi",
        "Model answers": "Soluzioni",
        "Notebooks": "Notebook",
        "Open the exercises": "Apri gli esercizi",
        "Jamming": "Blocco (jamming)", "Flocking": "Moto in stormo", "Cell displacements": "Spostamenti delle cellule",
        "Open Moving tissues": "Apri Moving tissues (in inglese)",
        "One method, many questions": "Un metodo, molte domande",
        "What every page does": "Cosa fa ogni pagina",
        "The questions differ, the steps do not. The first three panels run live on a small simulated movie of jiggling particles.":
            "Le domande cambiano, i passi no. I primi tre pannelli girano dal vivo su un piccolo filmato simulato di particelle che si agitano.",
        "Movie": "Filmato",
        "An ordinary microscope movie, many frames in a row.": "Un normale filmato al microscopio, molti fotogrammi di fila.",
        "Difference": "Differenza",
        "Subtract two frames taken a delay apart: what stays still, dust and uneven light included, cancels; only what moved is left.":
            "Sottrai due fotogrammi presi a un certo intervallo di tempo: ciò che resta fermo, polvere e luce non uniforme comprese, si cancella; resta solo ciò che si è mosso.",
        "Fourier map": "Mappa di Fourier",
        "Sort the difference by pattern size and average over the movie. Each ring holds one size: wide patterns near the centre (blue), small ones farther out (red).":
            "Ordina la differenza per dimensione del motivo e fai la media sul filmato. Ogni anello contiene una dimensione: i motivi larghi vicino al centro (blu), quelli piccoli più all'esterno (rosso).",
        "delay (log)": "intervallo (log)", "difference": "differenza",
        "Curves": "Curve",
        "For each pattern size, how the difference grows with the delay. Small patterns (red) change first, wide ones (blue) last.":
            "Per ogni dimensione del motivo, come cresce la differenza con l'intervallo. I motivi piccoli (rosso) cambiano per primi, quelli larghi (blu) per ultimi.",
        "diffusion": "diffusione", "swimming": "nuoto", "wide": "larghi", "fine": "fini", "rate (log)": "velocità (log)",
        "Infer the physical properties": "Ricava le proprietà fisiche",
        "Compare how strongly each pattern appears and how it changes over time. A model connects these measurements to particle size, swimming speed, drift, material response or collective motion. The sketch shows one example: the rate of each pattern size (q, larger for finer patterns), whose slope tells diffusion (2) from swimming (1).":
            "Confronta quanto è forte ogni motivo e come cambia nel tempo. Un modello collega queste misure alla dimensione delle particelle, alla velocità di nuoto, alla deriva, alla risposta del materiale o al moto collettivo. Lo schizzo mostra un esempio: la velocità con cui cambia ogni dimensione del motivo (q, più grande per motivi più fini), la cui pendenza distingue la diffusione (2) dal nuoto (1).",
        "From the browser to the lab": "Dal browser al laboratorio",
        "Your own movies": "I tuoi filmati",
        "Lattuada et al., J. Chem. Phys. 163, 161501 (2025). How DDM works in practice: choosing the microscope and camera, recording the movie, analysing it and checking the result.":
            "Lattuada et al., J. Chem. Phys. 163, 161501 (2025). Come funziona la DDM in pratica: scegliere microscopio e telecamera, registrare il filmato, analizzarlo e verificare il risultato.",
        "Our open-source code to analyse your own movies: a Python library that runs on the processor or the graphics card and computes the structure function of long movies quickly.":
            "Il nostro codice open source per analizzare i tuoi filmati: una libreria Python che gira sul processore o sulla scheda grafica e calcola in fretta la funzione di struttura di filmati lunghi.",
        "About these pages": "Su queste pagine",
        "These pages are a divertissement. For fun, we took configurations close to those of our": "Queste pagine sono un divertissement. Per gioco abbiamo preso configurazioni vicine a quelle del nostro",
        "SoMeX lab": "laboratorio SoMeX",
        "and used them to simulate some typical DDM experiments in your browser. The simulations are simple and rely on many approximations; each page says which. More applications will follow. Found something wrong or not working? Please let us (me and Anthropic Claude) know through the":
            "e le abbiamo usate per simulare alcuni esperimenti tipici di DDM nel tuo browser. Le simulazioni sono semplici e si basano su molte approssimazioni; ogni pagina dice quali. Altre applicazioni seguiranno. Hai trovato qualcosa di sbagliato o che non funziona? Faccelo sapere (a me e ad Anthropic Claude) tramite la",
        "contact page": "pagina dei contatti",
        "To cite these pages: R. Cerbino,": "Per citare queste pagine: R. Cerbino,",
        "(2026), with the date you used them.": "(2026), con la data in cui le hai usate.",
        "Roberto Cerbino, University of Vienna. The simulations run entirely in your browser; nothing is uploaded.": "Roberto Cerbino, Università di Vienna. Le simulazioni girano interamente nel tuo browser; non viene caricato nulla.",
    },
    "de": {
        "Differential dynamic microscopy": "Differentielle dynamische Mikroskopie",
        "DDM, hands on": "DDM zum Ausprobieren",
        "(DDM), introduced in 2008 (R. Cerbino and V. Trappe,": "(DDM), 2008 eingeführt (R. Cerbino und V. Trappe,",
        "), turns an ordinary microscope movie into a light scattering experiment: it measures how fast the patterns of each size in the image fade, without following any single particle or cell. From those rates follow sizes, speeds and much more. Each page below simulates an experiment in your browser and takes you through the whole analysis, from the raw movie to the result.":
            "), macht aus einem gewöhnlichen Mikroskopfilm ein Lichtstreuexperiment: Sie misst, wie schnell die Muster jeder Größe im Bild verblassen, ohne einem einzelnen Teilchen oder einer einzelnen Zelle zu folgen. Daraus ergeben sich Größen, Geschwindigkeiten und vieles mehr. Jede Seite unten simuliert ein Experiment in Ihrem Browser und führt Sie durch die ganze Auswertung, vom Rohfilm bis zum Ergebnis. Die Seiten der Anwendungen sind auf Englisch.",
        "New here?": "Neu hier?",
        "Try doubling the bead size": "Verdoppeln Sie die Größe der Kugeln",
        ": predict how the curves move, then watch the page check it. Teaching DDM?": ": Sagen Sie voraus, wie sich die Kurven verschieben, und sehen Sie zu, wie die Seite es prüft. Sie unterrichten DDM?",
        "Exercises with model answers": "Übungen mit Musterlösungen",
        "for every page, printable.": "für jede Seite, zum Ausdrucken.",
        "Brownian motion": "Brownsche Bewegung",
        "How big are they?": "Wie groß sind sie?",
        "Bright field, colloidal beads (sketch)": "Hellfeld, kolloidale Kugeln (Skizze)",
        "Size colloidal particles from how fast they wander, as in dynamic light scattering, but with a microscope and in samples where light scattering struggles.":
            "Bestimmen Sie die Größe kolloidaler Teilchen daraus, wie schnell sie umherwandern, wie bei der dynamischen Lichtstreuung, aber mit einem Mikroskop und in Proben, bei denen die Lichtstreuung an ihre Grenzen stößt.",
        "Spheres, ellipsoids and rods, some of which turn as well as wander; seven imaging modes from bright field to confocal; cameras, noise, depth of field and what each does to the result.":
            "Kugeln, Ellipsoide und Stäbchen, von denen sich manche auch drehen; sieben Bildgebungsverfahren vom Hellfeld bis zur Konfokalmikroskopie; Kameras, Rauschen, Schärfentiefe und was jedes davon am Ergebnis ändert.",
        "Diffusion": "Diffusion", "Particle size": "Teilchengröße", "Rotation": "Rotation",
        "Open Sizing particles": "Sizing particles öffnen (auf Englisch)",
        "Active motion": "Aktive Bewegung",
        "How fast do they swim?": "Wie schnell schwimmen sie?",
        "Phase contrast, bacteria (sketch)": "Phasenkontrast, Bakterien (Skizze)",
        "Measure how fast bacteria, algae or sperm swim, how much the speeds spread and which share of the cells swims, from a motility movie with thousands of cells.":
            "Messen Sie, wie schnell Bakterien, Algen oder Spermien schwimmen, wie stark die Geschwindigkeiten streuen und welcher Anteil der Zellen schwimmt, aus einem Motilitätsfilm mit Tausenden von Zellen.",
        "E. coli strains, Salmonella, B. subtilis, Chlamydomonas, Euglena and bull sperm, set up as in published experiments, or cells of your own design.":
            "E.-coli-Stämme, Salmonella, B. subtilis, Chlamydomonas, Euglena und Bullenspermien, eingestellt wie in veröffentlichten Experimenten, oder Zellen nach eigenem Entwurf.",
        "Swimming speed": "Schwimmgeschwindigkeit", "Speed spread": "Streuung der Geschwindigkeiten", "Share of swimmers": "Anteil der Schwimmer",
        "Open Swimming cells": "Swimming cells öffnen (auf Englisch)",
        "Drift": "Drift",
        "Where are they going?": "Wohin bewegen sie sich?",
        "Bright field, beads in a flow (sketch)": "Hellfeld, Kugeln in einer Strömung (Skizze)",
        "Measure the speed and direction of particles carried by a flow, by gravity or by a temperature gradient, while they keep jiggling, and find out how slow a drift a movie can still show.":
            "Messen Sie Geschwindigkeit und Richtung von Teilchen, die von einer Strömung, der Schwerkraft oder einem Temperaturgradienten getragen werden, während sie weiter zittern, und finden Sie heraus, wie langsam eine Drift sein darf, damit ein Film sie noch zeigt.",
        "Plug and channel flows; sedimentation with the microscope upright or on its side; thermophoresis of polystyrene beads with Soret coefficients from published measurements.":
            "Pfropfen- und Kanalströmungen; Sedimentation mit aufrechtem oder gekipptem Mikroskop; Thermophorese von Polystyrolkugeln mit Soret-Koeffizienten aus veröffentlichten Messungen.",
        "Flow": "Strömung", "Sedimentation": "Sedimentation", "Thermophoresis": "Thermophorese",
        "Open Drifting particles": "Drifting particles öffnen (auf Englisch)",
        "Viscoelasticity": "Viskoelastizität",
        "Liquid or solid?": "Flüssig oder fest?",
        "Bright field, beads in a gel (sketch)": "Hellfeld, Kugeln in einem Gel (Skizze)",
        "Measure how elastic and how viscous a soft material is, from how far tracer beads mixed into it get: microrheology with a microscope, from a drop of sample.":
            "Messen Sie, wie elastisch und wie zäh ein weiches Material ist, daraus, wie weit eingemischte Tracerkugeln kommen: Mikrorheologie mit einem Mikroskop, aus einem Tropfen Probe.",
        "Simple liquids, wormlike micelles, polymer solutions and a gel forming, with moduli known exactly; from the movie to G' and G'' over several decades of frequency.":
            "Einfache Flüssigkeiten, wurmartige Mizellen, Polymerlösungen und ein entstehendes Gel, mit genau bekannten Moduln; vom Film zu G' und G'' über mehrere Dekaden der Frequenz.",
        "Microrheology": "Mikrorheologie", "G' and G''": "G' und G''", "Gelation": "Gelbildung",
        "Open Liquid or solid": "Liquid or solid öffnen (auf Englisch)",
        "Interactions": "Wechselwirkungen",
        "How do they arrange in a crowd?": "Wie ordnen sie sich im Gedränge?",
        "Confocal, concentrated colloids (sketch)": "Konfokal, konzentrierte Kolloide (Skizze)",
        "Measure how particles that push each other arrange themselves, and how the crowd moves, from a confocal movie: the structure factor and collective diffusion, as in light scattering.":
            "Messen Sie, wie sich Teilchen anordnen, die einander wegdrücken, und wie sich das Gedränge bewegt, aus einem Konfokalfilm: Strukturfaktor und kollektive Diffusion, wie bei der Lichtstreuung.",
        "Hard and charged spheres from dilute to 45 % of the volume, all dyed or only a few; the particles are simulated pushing each other, so what DDM finds is checked against what they really do.":
            "Harte und geladene Kugeln, von verdünnt bis 45 % des Volumens, alle gefärbt oder nur wenige; in der Simulation drücken die Teilchen einander tatsächlich weg, so wird, was DDM findet, mit dem verglichen, was sie wirklich tun.",
        "Structure factor": "Strukturfaktor", "Collective diffusion": "Kollektive Diffusion", "Self diffusion": "Selbstdiffusion",
        "Open Crowded particles": "Crowded particles öffnen (auf Englisch)",
        "Proteins": "Proteine",
        "Do they attract or repel?": "Ziehen sie sich an oder stoßen sie sich ab?",
        "Bright field, a protein solution (sketch, contrast stretched)": "Hellfeld, eine Proteinlösung (Skizze, Kontrast verstärkt)",
        "Measure the size of proteins far too small to see, and whether they repel or attract each other, from bright-field movies at a few concentrations: the diffusion interaction parameter k":
            "Messen Sie die Größe von Proteinen, die viel zu klein sind, um sie zu sehen, und ob sie sich abstoßen oder anziehen, aus Hellfeldfilmen bei einigen Konzentrationen: den Diffusions-Wechselwirkungsparameter k",
        "and the second virial coefficient B": "und den zweiten Virialkoeffizienten B",
        "An antibody in low and high salt, albumin, lysozyme and a sticky antibody, or a protein of your own: set its charge and the salt, and see how both numbers follow.":
            "Ein Antikörper bei wenig und bei viel Salz, Albumin, Lysozym und ein klebriger Antikörper, oder ein eigenes Protein: Stellen Sie seine Ladung und das Salz ein und sehen Sie, wie beide Zahlen folgen.",
        "Protein size": "Proteingröße",
        "Open Proteins": "Proteins öffnen (auf Englisch)",
        "Yielding": "Fließgrenze",
        "When does it start to flow?": "Wann beginnt es zu fließen?",
        "Bright field, beads in a sheared gel (sketch)": "Hellfeld, Kugeln in einem gescherten Gel (Skizze)",
        "Shear a soft material back and forth and compare frames taken one full cycle apart: what the shear undoes cancels, and the rearrangements it leaves behind show when a soft solid yields and starts to flow.":
            "Scheren Sie ein weiches Material hin und her und vergleichen Sie Bilder, die genau einen Zyklus auseinanderliegen: Was die Scherung rückgängig macht, hebt sich auf, und die Umlagerungen, die sie zurücklässt, zeigen, wann ein weicher Festkörper nachgibt und zu fließen beginnt.",
        "A yield-stress microgel below and above its yield point, a rubber and a viscous liquid; a strain sweep from 5 % to 150 %, as in our echo-DDM experiments.":
            "Ein Mikrogel mit Fließgrenze, unter und über dieser Grenze, ein Gummi und eine zähe Flüssigkeit; ein Amplitudendurchlauf von 5 % bis 150 %, wie in unseren Echo-DDM-Experimenten.",
        "Oscillatory shear": "Oszillierende Scherung",
        "Open Sheared materials": "Sheared materials öffnen (auf Englisch)",
        "Collective motion": "Kollektive Bewegung",
        "Jammed, flowing or flocking?": "Blockiert, fließend oder im Schwarm?",
        "Fluorescence, nuclei of a cell sheet (sketch)": "Fluoreszenz, Zellkerne einer Zellschicht (Skizze)",
        "Tell whether a sheet of epithelial cells is stuck like a solid, flows like a liquid or moves as a flock, from a time-lapse of their stained nuclei, without following any cell.":
            "Erkennen Sie, ob eine Schicht von Epithelzellen wie ein Festkörper feststeckt, wie eine Flüssigkeit fließt oder sich als Schwarm bewegt, aus einer Zeitrafferaufnahme ihrer gefärbten Zellkerne, ohne einer einzelnen Zelle zu folgen.",
        "Crawling cells that push each other and steer together: jammed sheets, fluid ones, flocking solids and flocking liquids, as in our studies of reawakened epithelia; the rate of each pattern, and the network of nuclei followed cell by cell.":
            "Kriechende Zellen, die einander schieben und sich gemeinsam ausrichten: blockierte und fließende Schichten, schwärmende Festkörper und schwärmende Flüssigkeiten, wie in unseren Studien über wiedererweckte Epithelien; die Rate jedes Musters und das Netz der Zellkerne, Zelle für Zelle verfolgt.",
        "Start here": "Hier beginnen",
        "Pause the animations": "Animationen anhalten", "Skip to the content": "Zum Inhalt springen", "Play the animations": "Animationen abspielen",
        "How DDM works, step by step, from the raw movie to the size of a particle. The other pages build on it.": "Wie DDM funktioniert, Schritt für Schritt, vom Rohfilm bis zur Größe eines Teilchens. Die anderen Seiten bauen darauf auf.",
        "Classic applications": "Klassische Anwendungen",
        "Established uses of DDM, each about one kind of motion: swimming, drifting, and beads jiggling in a soft material.": "Bewährte Anwendungen der DDM, jede zu einer Art von Bewegung: Schwimmen, Driften und Kugeln, die in einem weichen Material zittern.",
        "Advanced applications": "Fortgeschrittene Anwendungen",
        "Newer methods, closer to current research: particles that push each other, proteins too small to see, materials under shear and moving tissues. They take the first page for granted.": "Neuere Methoden, nah an der aktuellen Forschung: Teilchen, die einander schieben, unsichtbar kleine Proteine, gescherte Materialien und bewegte Gewebe. Sie setzen die erste Seite voraus.",
        "Teaching and practice": "Für Lehre und Übung",
        "Exercises and notebooks": "Übungen und Notebooks",
        "Questions with model answers for every page, to predict, compute and discuss, printable for a class or for study on your own.": "Fragen mit Musterlösungen zu jeder Seite, zum Vorhersagen, Rechnen und Diskutieren, druckbar für den Unterricht oder zum Selbststudium.",
        "Every page lets you download the movie it simulated, and several link a Python notebook, to run the analysis yourself, with fastDDM or a few lines of numpy.": "Jede Seite lässt den simulierten Film herunterladen, und mehrere verweisen auf ein Python-Notebook, um die Analyse selbst durchzuführen, mit fastDDM oder wenigen Zeilen numpy.",
        "Exercises": "Übungen",
        "Model answers": "Musterlösungen",
        "Notebooks": "Notebooks",
        "Open the exercises": "Zu den Übungen",
        "Jamming": "Jamming", "Flocking": "Schwarmbildung", "Cell displacements": "Verschiebungen der Zellen",
        "Open Moving tissues": "Moving tissues öffnen (auf Englisch)",
        "One method, many questions": "Eine Methode, viele Fragen",
        "What every page does": "Was jede Seite macht",
        "The questions differ, the steps do not. The first three panels run live on a small simulated movie of jiggling particles.":
            "Die Fragen unterscheiden sich, die Schritte nicht. Die ersten drei Felder laufen live auf einem kleinen simulierten Film zitternder Teilchen.",
        "Movie": "Film",
        "An ordinary microscope movie, many frames in a row.": "Ein gewöhnlicher Mikroskopfilm, viele Bilder hintereinander.",
        "Difference": "Differenz",
        "Subtract two frames taken a delay apart: what stays still, dust and uneven light included, cancels; only what moved is left.":
            "Ziehen Sie zwei Bilder mit einem zeitlichen Abstand voneinander ab: Was stillsteht, Staub und ungleichmäßiges Licht eingeschlossen, hebt sich auf; nur was sich bewegt hat, bleibt.",
        "Fourier map": "Fourier-Karte",
        "Sort the difference by pattern size and average over the movie. Each ring holds one size: wide patterns near the centre (blue), small ones farther out (red).":
            "Sortieren Sie die Differenz nach der Größe der Muster und mitteln Sie über den Film. Jeder Ring enthält eine Größe: breite Muster nahe der Mitte (blau), kleine weiter außen (rot).",
        "delay (log)": "Abstand (log)", "difference": "Differenz",
        "Curves": "Kurven",
        "For each pattern size, how the difference grows with the delay. Small patterns (red) change first, wide ones (blue) last.":
            "Für jede Mustergröße, wie die Differenz mit dem zeitlichen Abstand wächst. Kleine Muster (rot) ändern sich zuerst, breite (blau) zuletzt.",
        "diffusion": "Diffusion", "swimming": "Schwimmen", "wide": "breit", "fine": "fein", "rate (log)": "Rate (log)",
        "Infer the physical properties": "Die physikalischen Eigenschaften ableiten",
        "Compare how strongly each pattern appears and how it changes over time. A model connects these measurements to particle size, swimming speed, drift, material response or collective motion. The sketch shows one example: the rate of each pattern size (q, larger for finer patterns), whose slope tells diffusion (2) from swimming (1).":
            "Vergleichen Sie, wie stark jedes Muster erscheint und wie es sich mit der Zeit ändert. Ein Modell verbindet diese Messungen mit Teilchengröße, Schwimmgeschwindigkeit, Drift, Materialverhalten oder kollektiver Bewegung. Die Skizze zeigt ein Beispiel: die Rate jeder Mustergröße (q, größer für feinere Muster), deren Steigung Diffusion (2) von Schwimmen (1) unterscheidet.",
        "From the browser to the lab": "Vom Browser ins Labor",
        "Your own movies": "Eigene Filme",
        "Lattuada et al., J. Chem. Phys. 163, 161501 (2025). How DDM works in practice: choosing the microscope and camera, recording the movie, analysing it and checking the result.":
            "Lattuada et al., J. Chem. Phys. 163, 161501 (2025). Wie DDM in der Praxis funktioniert: Mikroskop und Kamera wählen, den Film aufnehmen, ihn auswerten und das Ergebnis prüfen.",
        "Our open-source code to analyse your own movies: a Python library that runs on the processor or the graphics card and computes the structure function of long movies quickly.":
            "Unser Open-Source-Code zur Auswertung eigener Filme: eine Python-Bibliothek, die auf dem Prozessor oder der Grafikkarte läuft und die Strukturfunktion langer Filme schnell berechnet.",
        "About these pages": "Über diese Seiten",
        "These pages are a divertissement. For fun, we took configurations close to those of our": "Diese Seiten sind ein Divertissement. Zum Spaß haben wir Konfigurationen nahe denen unseres",
        "SoMeX lab": "SoMeX-Labors",
        "and used them to simulate some typical DDM experiments in your browser. The simulations are simple and rely on many approximations; each page says which. More applications will follow. Found something wrong or not working? Please let us (me and Anthropic Claude) know through the":
            "genommen und damit einige typische DDM-Experimente in Ihrem Browser simuliert. Die Simulationen sind einfach und beruhen auf vielen Näherungen; jede Seite sagt, auf welchen. Weitere Anwendungen folgen. Etwas ist falsch oder funktioniert nicht? Bitte lassen Sie es uns (mich und Anthropic Claude) über die",
        "To cite these pages: R. Cerbino,": "Zum Zitieren dieser Seiten: R. Cerbino,",
        "(2026), with the date you used them.": "(2026), mit dem Datum, an dem Sie sie benutzt haben.",
        "Roberto Cerbino, University of Vienna. The simulations run entirely in your browser; nothing is uploaded.": "Roberto Cerbino, Universität Wien. Die Simulationen laufen vollständig in Ihrem Browser; nichts wird hochgeladen.",
    },
}
ARIA = {
    "it": {
        "Applications": "Applicazioni",
        "Animation: particles jiggling in a liquid, as seen in a bright-field microscope": "Animazione: particelle che si agitano in un liquido, come in un microscopio in campo chiaro",
        "Animation: rod-shaped bacteria, some swimming and some still, as seen in a phase-contrast microscope": "Animazione: batteri a bastoncino, alcuni che nuotano e altri fermi, come in un microscopio a contrasto di fase",
        "Animation: particles jiggling and carried slowly to the right by a flow, as seen in a bright-field microscope": "Animazione: particelle che si agitano, trasportate lentamente verso destra da un flusso, come in un microscopio in campo chiaro",
        "Animation: beads rattling in place in a soft gel, as seen in a bright-field microscope": "Animazione: sfere che vibrano sul posto in un gel soffice, come in un microscopio in campo chiaro",
        "Animation: dyed particles packed close together, each jiggling among its neighbours, as seen in a confocal microscope": "Animazione: particelle colorate fitte, ognuna che si agita tra le vicine, come in un microscopio confocale",
        "Animation: a grey field with faint ripples that come and go, as proteins too small to see diffuse in a bright-field microscope": "Animazione: un campo grigio con deboli increspature che vanno e vengono, mentre proteine troppo piccole per essere viste diffondono in un microscopio in campo chiaro",
        "Animation: beads sliding back and forth, those above and below focus by more, as a soft material is sheared between two plates": "Animazione: sfere che scorrono avanti e indietro, di più quelle sopra e sotto il fuoco, mentre un materiale soffice è deformato tra due piastre",
        "Animation: fluorescent nuclei of a cell sheet, packed side by side, all drifting slowly the same way": "Animazione: nuclei fluorescenti di uno strato di cellule, fianco a fianco, che derivano lentamente tutti nella stessa direzione",
        "Simulated movie frame": "Fotogramma simulato", "Difference of two frames": "Differenza di due fotogrammi", "Fourier power of the difference, averaged": "Potenza di Fourier della differenza, mediata",
        "Curves rising with the delay, faster for smaller patterns": "Curve che salgono con l'intervallo, più in fretta per i motivi più piccoli",
        "Rates against q, one over the pattern size, on log scales: slope 2 for diffusion, slope 1 for swimming": "Velocità contro q, l'inverso della dimensione del motivo, in scala logaritmica: pendenza 2 per la diffusione, 1 per il nuoto",
    },
    "de": {
        "Applications": "Anwendungen",
        "Animation: particles jiggling in a liquid, as seen in a bright-field microscope": "Animation: Teilchen, die in einer Flüssigkeit zittern, wie in einem Hellfeldmikroskop",
        "Animation: rod-shaped bacteria, some swimming and some still, as seen in a phase-contrast microscope": "Animation: stäbchenförmige Bakterien, manche schwimmend, manche still, wie in einem Phasenkontrastmikroskop",
        "Animation: particles jiggling and carried slowly to the right by a flow, as seen in a bright-field microscope": "Animation: zitternde Teilchen, von einer Strömung langsam nach rechts getragen, wie in einem Hellfeldmikroskop",
        "Animation: beads rattling in place in a soft gel, as seen in a bright-field microscope": "Animation: Kugeln, die in einem weichen Gel auf der Stelle zittern, wie in einem Hellfeldmikroskop",
        "Animation: dyed particles packed close together, each jiggling among its neighbours, as seen in a confocal microscope": "Animation: dicht gepackte gefärbte Teilchen, jedes zwischen seinen Nachbarn zitternd, wie in einem Konfokalmikroskop",
        "Animation: a grey field with faint ripples that come and go, as proteins too small to see diffuse in a bright-field microscope": "Animation: ein graues Feld mit schwachen, kommenden und gehenden Wellen, während unsichtbar kleine Proteine in einem Hellfeldmikroskop diffundieren",
        "Animation: beads sliding back and forth, those above and below focus by more, as a soft material is sheared between two plates": "Animation: Kugeln, die hin und her gleiten, über und unter dem Fokus stärker, während ein weiches Material zwischen zwei Platten geschert wird",
        "Animation: fluorescent nuclei of a cell sheet, packed side by side, all drifting slowly the same way": "Animation: fluoreszierende Zellkerne einer Zellschicht, dicht an dicht, die alle langsam in dieselbe Richtung driften",
        "Simulated movie frame": "Simuliertes Filmbild", "Difference of two frames": "Differenz zweier Bilder", "Fourier power of the difference, averaged": "Fourier-Leistung der Differenz, gemittelt",
        "Curves rising with the delay, faster for smaller patterns": "Kurven, die mit dem zeitlichen Abstand ansteigen, schneller für kleinere Muster",
        "Rates against q, one over the pattern size, on log scales: slope 2 for diffusion, slope 1 for swimming": "Raten gegen q, den Kehrwert der Mustergröße, logarithmisch: Steigung 2 für Diffusion, 1 für Schwimmen",
    },
}
# plain replacements: links and the language switch, the title, a sentence that runs across a link
RAW = {
    "it": [('<html lang="en">', '<html lang="it">'), ("<title>DDM, hands on</title>", "<title>DDM, in pratica</title>"),
           ('<nav class="langs" aria-label="Language"><span aria-current="true" lang="en">English</span><a href="it/" hreflang="it" lang="it">Italiano</a><a href="de/" hreflang="de" lang="de">Deutsch</a></nav>',
            '<nav class="langs" aria-label="Lingua"><a href="../" hreflang="en" lang="en">English</a><span aria-current="true" lang="it">Italiano</span><a href="../de/" hreflang="de" lang="de">Deutsch</a></nav>'),
           ('href="https://en.wikipedia.org/wiki/Differential_dynamic_microscopy">Differential dynamic microscopy</a>', 'href="https://en.wikipedia.org/wiki/Differential_dynamic_microscopy" hreflang="en">Microscopia dinamica differenziale</a>')],
    "de": [('<html lang="en">', '<html lang="de">'), ("<title>DDM, hands on</title>", "<title>DDM zum Ausprobieren</title>"),
           ('<nav class="langs" aria-label="Language"><span aria-current="true" lang="en">English</span><a href="it/" hreflang="it" lang="it">Italiano</a><a href="de/" hreflang="de" lang="de">Deutsch</a></nav>',
            '<nav class="langs" aria-label="Sprache"><a href="../" hreflang="en" lang="en">English</a><a href="../it/" hreflang="it" lang="it">Italiano</a><span aria-current="true" lang="de">Deutsch</span></nav>'),
           ('href="https://en.wikipedia.org/wiki/Differential_dynamic_microscopy">Differential dynamic microscopy</a>', 'href="https://en.wikipedia.org/wiki/Differential_dynamic_microscopy" hreflang="en">Differentielle dynamische Mikroskopie</a>'),
           ('>contact page</a>.', '>Kontaktseite</a> wissen.')],
}
# the applications (relative links from /ddm/), moved one level up
APPS = ["sizing/", "swimmers/", "drift/", "rheology/", "crowded/", "proteins/", "shear/", "tissues/", "exercises/"]


def entities(s):
    return "".join(c if ord(c) < 128 else "&%s;" % html.entities.codepoint2name[ord(c)] if ord(c) in html.entities.codepoint2name else "&#%d;" % ord(c) for c in s)


def translate(page, lang):
    out = page
    for a, b in RAW[lang]:
        assert a in out, (lang, a[:60])
        out = out.replace(a, b)
    for en, tr in sorted(TEXT[lang].items(), key=lambda kv: -len(kv[0])):
        pat = re.compile(r">(\s*)" + re.escape(en) + r"(\s*)<")
        assert pat.search(out), (lang, en[:60])
        out = pat.sub(lambda m: ">" + m.group(1) + tr + m.group(2) + "<", out)
    for en, tr in ARIA[lang].items():
        a = 'aria-label="%s"' % en
        assert a in out, (lang, en[:60])
        out = out.replace(a, 'aria-label="%s"' % tr.replace('"', "&quot;"))
    for app in APPS:
        out = out.replace('href="' + app, 'href="../' + app)
    out = out.replace('location.replace("sizing/" + location.hash)', 'location.replace("../sizing/" + location.hash)')
    return entities(out)
