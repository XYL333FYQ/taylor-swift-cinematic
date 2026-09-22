export interface EraData {
  id: string;
  number: string;
  name: {
    en: string;
    zh: string;
  };
  subtitle: {
    en: string;
    zh: string;
  };
  year: string;
  color: string;
  colorAccent: string;
  gradient: string;
  tagline: {
    en: string;
    zh: string;
  };
  quote: {
    en: string;
    zh: string;
  };
  description: {
    en: string;
    zh: string;
  };
  image: string;
  watermark: string;
  stats: {
    tracks: number;
    genre: {
      en: string;
      zh: string;
    };
  };
}

export const ERAS: EraData[] = [
  {
    "id": "debut",
    "number": "01",
    "name": {
      "en": "Taylor Swift",
      "zh": "泰勒·斯威夫特 (首张同名专辑)"
    },
    "subtitle": {
      "zh": "那时候，喜欢一个人就够写一首歌。",
      "en": "Back when a crush was enough for a song."
    },
    "year": "2006",
    "color": "#14b8a6",
    "colorAccent": "#2dd4bf",
    "gradient": "linear-gradient(135deg, rgba(20, 184, 166, 0.18) 0%, rgba(13, 148, 136, 0.05) 50%, #050505 100%)",
    "tagline": {
      "zh": "那时候，喜欢一个人就够写一首歌。",
      "en": "Back when a crush was enough for a song."
    },
    "quote": {
      "en": "\"When you think Tim McGraw, I hope you think my favorite song.\"",
      "zh": "“当你想起蒂姆·麦格罗，我希望你能想起我最爱的那首歌。”"
    },
    "description": {
      "zh": "乡村吉他、卷发，还有藏不住的心事。重听这张，最动人的还是那种想把一切都告诉你的认真。",
      "en": "Country guitars and feelings too big to keep quiet. What stays with you is how much she wants to tell you."
    },
    "image": "./img/taylor/era-01.webp",
    "watermark": "DEBUT · 2006",
    "stats": {
      "tracks": 11,
      "genre": {
        "en": "Country / Acoustic Pop",
        "zh": "乡村 / 原声流行"
      }
    }
  },
  {
    "id": "fearless",
    "number": "02",
    "name": {
      "en": "Fearless",
      "zh": "无惧的爱 (Fearless)"
    },
    "subtitle": {
      "zh": "还相信故事会有一个好结局。",
      "en": "You still want the happy ending."
    },
    "year": "2008",
    "color": "#f59e0b",
    "colorAccent": "#fbbf24",
    "gradient": "linear-gradient(135deg, rgba(245, 158, 11, 0.22) 0%, rgba(180, 83, 9, 0.06) 50%, #050505 100%)",
    "tagline": {
      "zh": "还相信故事会有一个好结局。",
      "en": "You still want the happy ending."
    },
    "quote": {
      "en": "\"In a storm in my best dress, fearless.\"",
      "zh": "“盛装立于暴风雨中，无所畏惧。”"
    },
    "description": {
      "zh": "听到 Love Story 的前奏，还是会想跟着唱。有些明知道天真的期待，长大以后也没舍得丢。",
      "en": "The opening of Love Story still makes you want to sing. Growing up does not mean giving up every impossible hope."
    },
    "image": "./img/taylor/era-02.webp",
    "watermark": "FEARLESS · 2008",
    "stats": {
      "tracks": 13,
      "genre": {
        "en": "Country Pop",
        "zh": "乡村流行"
      }
    }
  },
  {
    "id": "speak-now",
    "number": "03",
    "name": {
      "en": "Speak Now",
      "zh": "爱的告白 (Speak Now)"
    },
    "subtitle": {
      "zh": "没来得及说的话，写成一整张。",
      "en": "Everything you meant to say."
    },
    "year": "2010",
    "color": "#9333ea",
    "colorAccent": "#c084fc",
    "gradient": "linear-gradient(135deg, rgba(147, 51, 234, 0.22) 0%, rgba(88, 28, 135, 0.06) 50%, #050505 100%)",
    "tagline": {
      "zh": "没来得及说的话，写成一整张。",
      "en": "Everything you meant to say."
    },
    "quote": {
      "en": "\"This night is sparkling, don't you let it go.\"",
      "zh": "“这一夜繁星璀璨，请别让它从指尖溜走。”"
    },
    "description": {
      "zh": "道歉、告白，也有不想再忍的脾气。这张的好，在于她真的把每句话都说了出来。",
      "en": "An apology, a confession, a little anger. There is something satisfying about hearing her finally say all of it."
    },
    "image": "./img/taylor/era-03.webp",
    "watermark": "SPEAK NOW · 2010",
    "stats": {
      "tracks": 14,
      "genre": {
        "en": "Country Rock / Pop",
        "zh": "乡村摇滚 / 流行"
      }
    }
  },
  {
    "id": "red",
    "number": "04",
    "name": {
      "en": "Red",
      "zh": "红 (Red)"
    },
    "subtitle": {
      "zh": "有些秋天，过了很久还记得。",
      "en": "Some autumns stay with you."
    },
    "year": "2012",
    "color": "#e11d48",
    "colorAccent": "#fb7185",
    "gradient": "linear-gradient(135deg, rgba(225, 29, 72, 0.22) 0%, rgba(136, 19, 55, 0.08) 50%, #050505 100%)",
    "tagline": {
      "zh": "有些秋天，过了很久还记得。",
      "en": "Some autumns stay with you."
    },
    "quote": {
      "en": "\"Loving him was like driving a new Maserati down a dead-end street.\"",
      "zh": "“爱他就像开着一辆崭新的玛莎拉蒂，狂飙向一条死胡同。”"
    },
    "description": {
      "zh": "上一首还在笑，下一首就不想说话了。Red 就是这样，连情绪乱成一团都很诚实。",
      "en": "One song has you laughing. The next leaves you quiet. Red lets its feelings be a mess, and that is part of the pull."
    },
    "image": "./img/taylor/era-04.webp",
    "watermark": "RED · 2012",
    "stats": {
      "tracks": 16,
      "genre": {
        "en": "Pop Rock / Country / Synth",
        "zh": "流行摇滚 / 合成器流行"
      }
    }
  },
  {
    "id": "1989",
    "number": "05",
    "name": {
      "en": "1989",
      "zh": "1989"
    },
    "subtitle": {
      "zh": "把车窗放下来，这首开大一点。",
      "en": "Windows down. Turn this one up."
    },
    "year": "2014",
    "color": "#0ea5e9",
    "colorAccent": "#38bdf8",
    "gradient": "linear-gradient(135deg, rgba(14, 165, 233, 0.22) 0%, rgba(3, 105, 161, 0.06) 50%, #050505 100%)",
    "tagline": {
      "zh": "把车窗放下来，这首开大一点。",
      "en": "Windows down. Turn this one up."
    },
    "quote": {
      "en": "\"The lights are so bright, but they never blind me.\"",
      "zh": "“这里的灯火如此璀璨，却从未让我迷失双眼。”"
    },
    "description": {
      "zh": "适合走路带风，也适合假装已经放下。旋律那么亮，偶尔还是会听出一点舍不得。",
      "en": "For walking a little faster and acting like you are over it. Even the brightest hooks leave room for a little longing."
    },
    "image": "./img/taylor/era-05.webp",
    "watermark": "1989 · 2014",
    "stats": {
      "tracks": 13,
      "genre": {
        "en": "Synth-Pop",
        "zh": "合成器流行"
      }
    }
  },
  {
    "id": "reputation",
    "number": "06",
    "name": {
      "en": "reputation",
      "zh": "名誉 (reputation)"
    },
    "subtitle": {
      "zh": "外面很吵，喜欢谁是自己的事。",
      "en": "Let them talk. You know who matters."
    },
    "year": "2017",
    "color": "#e2e8f0",
    "colorAccent": "#94a3b8",
    "gradient": "linear-gradient(135deg, rgba(71, 85, 105, 0.28) 0%, rgba(15, 23, 42, 0.4) 50%, #050505 100%)",
    "tagline": {
      "zh": "外面很吵，喜欢谁是自己的事。",
      "en": "Let them talk. You know who matters."
    },
    "quote": {
      "en": "\"There will be no explanation, there will just be reputation.\"",
      "zh": "“不再有任何解释，只留下我的名誉。”"
    },
    "description": {
      "zh": "第一耳是低音和锋芒，听久了却总记得那些小心保护的温柔。尤其是最后那首 New Year’s Day。",
      "en": "The bass gets your attention. The tenderness is what keeps you here, right through to New Year’s Day."
    },
    "image": "./img/taylor/era-06.webp",
    "watermark": "REPUTATION · 2017",
    "stats": {
      "tracks": 15,
      "genre": {
        "en": "Electropop / Industrial Trap",
        "zh": "电子流行 / 陷阱工业"
      }
    }
  },
  {
    "id": "lover",
    "number": "07",
    "name": {
      "en": "Lover",
      "zh": "恋人 (Lover)"
    },
    "subtitle": {
      "zh": "终于可以大大方方地说喜欢。",
      "en": "It feels good to say it out loud."
    },
    "year": "2019",
    "color": "#ec4899",
    "colorAccent": "#f472b6",
    "gradient": "linear-gradient(135deg, rgba(236, 72, 153, 0.22) 0%, rgba(131, 24, 67, 0.06) 50%, #050505 100%)",
    "tagline": {
      "zh": "终于可以大大方方地说喜欢。",
      "en": "It feels good to say it out loud."
    },
    "quote": {
      "en": "\"I want to be defined by the things that I love.\"",
      "zh": "“我想由我所热爱的事物来定义我的人生。”"
    },
    "description": {
      "zh": "粉色也好，直白也好。想把一个人写进日常，连平平无奇的周末都觉得值得唱。",
      "en": "Pink skies and very ordinary weekends. Wanting someone in your everyday life can be enough to write about."
    },
    "image": "./img/taylor/era-07.webp",
    "watermark": "LOVER · 2019",
    "stats": {
      "tracks": 18,
      "genre": {
        "en": "Pop / Dream Pop",
        "zh": "流行 / 梦幻流行"
      }
    }
  },
  {
    "id": "folklore",
    "number": "08",
    "name": {
      "en": "folklore",
      "zh": "民间故事 (folklore)"
    },
    "subtitle": {
      "zh": "雨天，耳机，暂时不回消息。",
      "en": "Rain outside. Headphones on."
    },
    "year": "2020",
    "color": "#a1a1aa",
    "colorAccent": "#d4d4d8",
    "gradient": "linear-gradient(135deg, rgba(161, 161, 170, 0.2) 0%, rgba(39, 39, 42, 0.25) 50%, #050505 100%)",
    "tagline": {
      "zh": "雨天，耳机，暂时不回消息。",
      "en": "Rain outside. Headphones on."
    },
    "quote": {
      "en": "\"And when I felt like I was an old cardigan under someone's bed, you put me on and said I was your favorite.\"",
      "zh": "“当我觉得自己就像别人床底下的一件破羊毛衫，你却将我穿起，说我是你的最爱。”"
    },
    "description": {
      "zh": "故事里的人不一定是她，却很容易让你想到自己。适合完整听完，不急着切下一首。",
      "en": "The people in these songs may be invented. What they remind you of usually is not. Give this one a whole afternoon."
    },
    "image": "./img/taylor/era-08.webp",
    "watermark": "FOLKLORE · 2020",
    "stats": {
      "tracks": 16,
      "genre": {
        "en": "Indie Folk / Chamber Pop",
        "zh": "独立民谣 / 室内流行"
      }
    }
  },
  {
    "id": "evermore",
    "number": "09",
    "name": {
      "en": "evermore",
      "zh": "永恒传说 (evermore)"
    },
    "subtitle": {
      "zh": "听完了，还想在这里待一会儿。",
      "en": "Stay a little longer."
    },
    "year": "2020",
    "color": "#d97706",
    "colorAccent": "#f59e0b",
    "gradient": "linear-gradient(135deg, rgba(217, 119, 6, 0.2) 0%, rgba(69, 26, 3, 0.15) 50%, #050505 100%)",
    "tagline": {
      "zh": "听完了，还想在这里待一会儿。",
      "en": "Stay a little longer."
    },
    "quote": {
      "en": "\"Long story short, I survived.\"",
      "zh": "“长话短说，我活下来了。”"
    },
    "description": {
      "zh": "比起一个明确的结局，更喜欢这些歌留下的余味。像冬天聊到很晚，谁都没急着起身。",
      "en": "Not every story needs a neat ending. These songs linger like a winter conversation nobody quite wants to leave."
    },
    "image": "./img/taylor/era-09.webp",
    "watermark": "EVERMORE · 2020",
    "stats": {
      "tracks": 15,
      "genre": {
        "en": "Alternative Rock / Folk",
        "zh": "另类摇滚 / 民谣"
      }
    }
  },
  {
    "id": "midnights",
    "number": "10",
    "name": {
      "en": "Midnights",
      "zh": "午夜 (Midnights)"
    },
    "subtitle": {
      "zh": "白天想通的事，午夜又想了一遍。",
      "en": "It made sense before midnight."
    },
    "year": "2022",
    "color": "#6366f1",
    "colorAccent": "#818cf8",
    "gradient": "linear-gradient(135deg, rgba(99, 102, 241, 0.24) 0%, rgba(30, 27, 75, 0.25) 50%, #050505 100%)",
    "tagline": {
      "zh": "白天想通的事，午夜又想了一遍。",
      "en": "It made sense before midnight."
    },
    "quote": {
      "en": "\"Meet me at midnight.\"",
      "zh": "“在午夜时分，与我相遇。”"
    },
    "description": {
      "zh": "关灯以后，那些小事又开始变大。嘴上说没关系，脑子里早就重演了不知道多少遍。",
      "en": "Lights out, and the little things get loud again. You said it was fine. Your mind has been replaying it ever since."
    },
    "image": "./img/taylor/era-10.webp",
    "watermark": "MIDNIGHTS · 2022",
    "stats": {
      "tracks": 13,
      "genre": {
        "en": "Synth-Pop / Chillwave",
        "zh": "合成器流行 / 慢波流行"
      }
    }
  },
  {
    "id": "ttpd",
    "number": "11",
    "name": {
      "en": "The Tortured Poets Department",
      "zh": "苦难诗社 (TTPD)"
    },
    "subtitle": {
      "zh": "这次，没把话整理好再说。",
      "en": "Before the feelings were tidied away."
    },
    "year": "2024",
    "color": "#f1f5f9",
    "colorAccent": "#cbd5e1",
    "gradient": "linear-gradient(135deg, rgba(203, 213, 225, 0.2) 0%, rgba(30, 41, 59, 0.25) 50%, #050505 100%)",
    "tagline": {
      "zh": "这次，没把话整理好再说。",
      "en": "Before the feelings were tidied away."
    },
    "quote": {
      "en": "\"All's fair in love and poetry.\"",
      "zh": "“在爱情与诗歌里，一切手段皆为公平。”"
    },
    "description": {
      "zh": "有些句子太长，有些情绪反复。听着听着，会觉得难过本来就不总是体面的。",
      "en": "Long sentences. Thoughts that circle back. Sometimes sadness is untidy, and these songs leave it that way."
    },
    "image": "./img/taylor/era-11.webp",
    "watermark": "THE TORTURED POETS DEPARTMENT · 2024",
    "stats": {
      "tracks": 31,
      "genre": {
        "en": "Synth-Pop / Literary Ballad",
        "zh": "合成器流行 / 文学叙事谣曲"
      }
    }
  },
  {
    "id": "showgirl",
    "number": "12",
    "name": {
      "en": "The Life of a Showgirl",
      "zh": "歌舞女郎的一生"
    },
    "subtitle": {
      "zh": "今晚想听一点亮的。",
      "en": "Something brighter for tonight."
    },
    "year": "2025",
    "color": "#d47639",
    "colorAccent": "#eeb383",
    "gradient": "linear-gradient(135deg, #55321e66, #050505)",
    "tagline": {
      "zh": "今晚想听一点亮的。",
      "en": "Something brighter for tonight."
    },
    "quote": {
      "en": "A new chapter. A different kind of light.",
      "zh": "新的篇章，另一种光芒。"
    },
    "description": {
      "zh": "橙色、闪片，还有忍不住跟着哼的旋律。不是每次戴上耳机，都要想起一个难过的人。",
      "en": "Orange, glitter, and a melody you catch yourself humming. Not every listen has to bring back someone you miss."
    },
    "image": "./img/taylor/era-12.webp",
    "watermark": "SHOWGIRL · 2025",
    "stats": {
      "tracks": 12,
      "genre": {
        "en": "Pop",
        "zh": "流行"
      }
    }
  }
];
