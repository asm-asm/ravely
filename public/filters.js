export const filterGroups = [
  { key: 'category', label: '作りたいもの', options: [
    ['shawl-wrap', 'ショール'], ['hat', '帽子'], ['socks', '靴下'],
    ['sweater', 'セーター'], ['cardigan', 'カーディガン'], ['scarf', 'マフラー'],
  ] },
  { key: 'craft', label: '編み方', options: [['knitting', '棒針編み'], ['crochet', 'かぎ針編み']] },
  { key: 'language', label: 'パターンの言語', options: [['ja', '日本語'], ['en', '英語'], ['fr', 'フランス語'], ['de', 'ドイツ語']] },
  { key: 'availability', label: '価格', options: [['free', '無料のみ']] },
  { key: 'weight', label: '糸の太さ（Ravelry表記）', advanced: true, options: [
    ['lace', 'Lace'], ['fingering', 'Fingering'], ['sport', 'Sport'], ['dk', 'DK'], ['worsted', 'Worsted'], ['aran', 'Aran'], ['bulky', 'Bulky'],
  ] },
  { key: 'fit', label: '対象サイズ', advanced: true, options: [['baby', 'ベビー'], ['child', '子ども'], ['adult', '大人']] },
  { key: 'pa', label: '編み方の特徴', advanced: true, options: [
    ['seamless', 'とじはぎなし'], ['top-down', 'トップダウン'], ['in-the-round', '輪編み'], ['worked-flat', '平編み'], ['lace', 'レース模様'],
  ] },
];
