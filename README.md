# kgraph

### Link: https://asciikgraphgrok.vercel.app/ ###

Upload your academic consciousness. Share it with the people you study beside.

A Yale semester is a pile of courses that only meet in your head. kgraph turns that pile into a living ASCII graph: every folder, every note, every idea that quietly connects them. You upload it. Friends can walk it. You can index the whole thing, ask grokbot for a refresher, and plan the next course from what you already know.

## Upload it

Point kgraph at the notes you already keep. Drop a local folder, or choose one with **set different root directory**. A GoodNotes export, a course directory, PDFs, markdown, and text — the folder becomes the graph in front of you. Courses are branches. Each file gets a short summary. Lines appear where two notes are about the same idea, even when they lived in different classes.

kgraph will connect to any file system you study in: Notion, GoodNotes, and the local folder on your laptop. Wherever the files sit, they upload as one consciousness you can share.

## Share it with friends

Open **friends** and search a Yale email. **Add** them. **Remove** them when the semester changes. Their graph opens on your screen, so you can see what they are up to and what they are thinking: the courses on their mind, the concepts they keep returning to, the note that ties two classes together.

The index runs across everyone you have added. Search notes, concepts, and people. The same idea in your linear algebra and a friend's philosophy shows up in one place. You are reading the shape of someone else's Yale.

## Index it, refresh it, plan from it

The graph is an index of what you know. Drag to turn it. Hover a note to light its links. Click for the summary, the concepts, and the notes it connects to.

**grokbot** answers from that index. Ask it:

- What have I learned?
- Summarize my latest notes.
- Give me a refresher on probability.
- What Yale course should I take next?

A refresher is a question. Next semester is a question too.

## Show it off

Three backgrounds, and you switch them whenever you want:

- **dark** — quiet black, the graph alone
- **koi** — colored ASCII koi swimming behind your notes
- **matrix** — green glyphs falling behind the graph

Your choice stays. Open a friend's graph and the room changes with them: koi for one person, matrix for another, dark when the notes want quiet.

## Try it

1. Drop a folder of notes, or set a different root directory.
2. Drag to rotate. Hover a note. Click it.
3. Open **friends**. Search a Yale email. Add them, open their graph, remove them when you are done.
4. Search the index for a concept you share.
5. Open **grokbot** and ask for a refresher or the next Yale course.
6. Switch the background: dark, koi, matrix.

Your files stay on your computer.

## Run locally

```
npm install
npm run dev
```

## Built with Grok

Grok is the model inside the app, and the one that built it. The shot below is Cursor on this repo with the agent set to Grok 4.7, writing the graph from a real Yale course folder.

![Cursor agent set to Grok 4.7, building kgraph](docs/using-grok.png)
