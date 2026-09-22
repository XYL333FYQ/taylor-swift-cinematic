export type Language = 'en' | 'zh';

export interface SiteCopy {
  pageTitle: string;
  brand: string;
  artistName: string;
  role: string;
  soundOn: string;
  soundOff: string;
  switchLabel: string;
  scrollIndicator: string;

  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    scrollHint: string;
    enterButton: string;
  };

  cylinder: {
    perspectives: {
      tag: string;
      title: string;
      subtitle: string;
    }[];
  };

  portal: {
    badge: string;
    title: string;
    description: string;
    instruction: string;
  };

  erasCorridor: {
    badge: string;
    title: string;
    subtitle: string;
    scrollHint: string;
    cardTag: string;
    viewTracks: string;
  };

  spotlight: {
    badge: string;
    eraTitle: string;
    eraYear: string;
    headline: string;
    narrative: string;
    quote: string;
    quoteAuthor: string;
    sonicBlueprint: string;
    sonicDesc: string;
    monochromeBadge: string;
  };

  finale: {
    badge: string;
    title: string;
    subtitle: string;
    closingQuote: string;
    credits: {
      director: string;
      music: string;
      curation: string;
    };
    restartText: string;
  };
}

export const copyData: Record<Language, SiteCopy> = {
  "en": {
    "pageTitle": "Taylor Swift — A song for every version of you",
    "brand": "TAYLOR SWIFT",
    "artistName": "Taylor Alison Swift",
    "role": "For the songs we keep coming back to",
    "soundOn": "SOUND ON",
    "soundOff": "SOUND OFF",
    "switchLabel": "中文",
    "scrollIndicator": "SCROLL TO EXPLORE",
    "hero": {
      "eyebrow": "FOR THE ONES WHO KEPT LISTENING",
      "title": "TAYLOR SWIFT",
      "subtitle": "records. Some you grew up with. Some found you exactly when you needed them.",
      "scrollHint": "A little further down",
      "enterButton": "BACK TO THE FIRST SONG"
    },
    "cylinder": {
      "perspectives": [
        {
          "tag": "01 · THE FIRST LISTEN",
          "title": "Which song was yours?",
          "subtitle": "Maybe Love Story. Maybe something much later. There is an opening you would know anywhere."
        },
        {
          "tag": "02 · YEARS LATER",
          "title": "Same song. Different you.",
          "subtitle": "A line you used to sing without thinking can land differently a few years later."
        },
        {
          "tag": "03 · ON REPEAT",
          "title": "She found the words.",
          "subtitle": "Sometimes sending someone a song says more than trying to explain."
        },
        {
          "tag": "04 · STILL HERE",
          "title": "One more listen.",
          "subtitle": "Headphones on. Keep these few minutes for yourself."
        }
      ]
    },
    "portal": {
      "badge": "THE SONGS THAT STAYED",
      "title": "You remember where you were.",
      "description": "The walk home. The last train. Someone you do not talk to anymore.",
      "instruction": "Keep going. You know these ones."
    },
    "erasCorridor": {
      "badge": "THE RECORD SHELF",
      "title": "The ones you wore out.",
      "subtitle": "Not the best one. The one you could never take off repeat.",
      "scrollHint": "Slide to the next record",
      "cardTag": "RECORD",
      "viewTracks": "TRACKS"
    },
    "spotlight": {
      "badge": "ON REPEAT · 2025",
      "eraTitle": "The Life of a Showgirl",
      "eraYear": "2025",
      "headline": "A little more glitter tonight.",
      "narrative": "After all those late-night conversations with herself, it feels good to hear something lighter. Put this one on while getting ready. Sing along. Wear the thing you have been saving.",
      "quote": "Some records are for staying up. This one is for going out.",
      "quoteAuthor": "A note beside the record",
      "sonicBlueprint": "PUT IT ON WHEN",
      "sonicDesc": "You are getting ready, walking to meet a friend, or giving an ordinary day a better soundtrack.",
      "monochromeBadge": "A LITTLE MORE GLITTER"
    },
    "finale": {
      "badge": "UNTIL NEXT TIME",
      "title": "We will come back to these.",
      "subtitle": "The playlist gets longer. Some songs never leave it.",
      "closingQuote": "If this reminded you of a song you have not heard in a while, go put it on.",
      "credits": {
        "director": "Made out of fondness",
        "music": "For the nights on repeat",
        "curation": "And everyone still listening"
      },
      "restartText": "ONE MORE TIME"
    }
  },
  "zh": {
    "pageTitle": "Taylor Swift — 总有一首，写过你",
    "brand": "泰勒·斯威夫特",
    "artistName": "Taylor Alison Swift",
    "role": "留给那些听了很多遍的歌",
    "soundOn": "声音已开",
    "soundOff": "声音已关",
    "switchLabel": "EN",
    "scrollIndicator": "向下滚动探索",
    "hero": {
      "eyebrow": "写给一直在听的你",
      "title": "TAYLOR SWIFT",
      "subtitle": "张专辑。有些陪你长大，有些替你说了没说出口的话。",
      "scrollHint": "往下看看",
      "enterButton": "从那首歌开始"
    },
    "cylinder": {
      "perspectives": [
        {
          "tag": "01 · 初听",
          "title": "你是从哪首歌开始的？",
          "subtitle": "也许是 Love Story，也许更晚。总有一个前奏，你一听就认得。"
        },
        {
          "tag": "02 · 后来",
          "title": "歌没变，听歌的人变了。",
          "subtitle": "当年只觉得好听的那一句，后来在某个晚上，突然就懂了。"
        },
        {
          "tag": "03 · 重听",
          "title": "有些话，还是她唱得明白。",
          "subtitle": "不想解释的时候，就把那首歌发过去。"
        },
        {
          "tag": "04 · 还在",
          "title": "再听一遍吧。",
          "subtitle": "耳机戴好。这几分钟，留给自己。"
        }
      ]
    },
    "portal": {
      "badge": "那些年，那些歌",
      "title": "前奏响起，就想起了那时候。",
      "description": "那条放学的路，那趟没睡着的车，还有一个早就不联系的人。",
      "instruction": "往下翻，还有你熟悉的"
    },
    "erasCorridor": {
      "badge": "唱片架",
      "title": "这一张，你听了多久？",
      "subtitle": "不用选最好的。选你舍不得删掉的那张。",
      "scrollHint": "滑动看看下一张",
      "cardTag": "唱片",
      "viewTracks": "首曲目"
    },
    "spotlight": {
      "badge": "最近在听 · 2025",
      "eraTitle": "歌舞女郎的一生",
      "eraYear": "2025",
      "headline": "这次，把灯开亮一点。",
      "narrative": "听过了深夜里的自言自语，也想听她轻快一点。橙色闪片、上扬的旋律，这张适合出门前放，跟着哼，顺便挑一件喜欢的衣服。",
      "quote": "有些歌留给凌晨，有些歌适合今晚出门。",
      "quoteAuthor": "写在这张唱片旁边",
      "sonicBlueprint": "什么时候听",
      "sonicDesc": "准备出门、走去见朋友，或者只是想让普通的一天有点好心情。",
      "monochromeBadge": "今晚，亮一点"
    },
    "finale": {
      "badge": "先听到这里",
      "title": "下次，还听她。",
      "subtitle": "歌单会越攒越长。有些歌，还是会一直留着。",
      "closingQuote": "如果这里让你想起了某首很久没听的歌，现在就去放吧。",
      "credits": {
        "director": "因为喜欢，所以留在这里",
        "music": "给那些单曲循环的夜晚",
        "curation": "也给还在听的我们"
      },
      "restartText": "再翻一遍"
    }
  }
};
