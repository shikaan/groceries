type ListItem = {
  checked: boolean;
  name: string;
};

type List = Record<string, ListItem[]>;

const state = new Proxy<{ list: List }>(
  {
    list: {},
  },
  {
    set(target, key, value) {
      target[key] = value;
      render();
      location.hash = LZString.compressToEncodedURIComponent(
        encode(state.list),
      );
      return true;
    },
  },
);

function decode(decompressed: string): List {
  const list: List = {};

  const lines = decompressed.split("\n");
  const delimiter = lines.findIndex((line) => !line.trim());

  const rawCategories = lines.slice(0, delimiter);
  const rawItems = lines.slice(delimiter + 1);

  const categories: Record<string, string> = rawCategories.reduce(
    (acc, raw) => {
      const [index, name] = raw.split(":");
      acc[index] = name;
      list[name] = [];
      return acc;
    },
    {},
  );

  rawItems.forEach((raw) => {
    const [category, checked, name] = raw.split(",");
    const item: ListItem = {
      name,
      checked: checked === "1",
    };
    list[categories[category]].push(item);
  });

  return list;
}

function encode(list: List): string {
  const categories = Object.keys(list);
  const categoryLines = categories.map((c, i) => `${i}:${c}`);

  const itemLines: string[] = [];
  for (const [idx, category] of Object.entries(categories)) {
    list[category].forEach((item) => {
      itemLines.push(`${idx},${item.checked ? "1" : "0"},${item.name}`);
    });
  }

  return `${categoryLines.join("\n")}\n\n${itemLines.join("\n")}`;
}

const $main = document.getElementsByTagName("main")[0];

function render() {
  const list = state.list;

  $main.innerHTML = "";
  for (const [category, items] of Object.entries(list)) {
    const $section = document.createElement("section");

    const $sectionName = document.createElement("h3");
    $sectionName.classList.add("name");
    $sectionName.innerText = category;

    $sectionName.setAttribute("contenteditable", "false");
    $sectionName.addEventListener("pointerup", () => {
      $sectionName.setAttribute("contenteditable", "true");
      $sectionName.focus();
    });
    $sectionName.addEventListener("blur", () => {
      const name = $sectionName.innerText;
      // This is to preserve the order in the map
      const entries = Object.entries(list).map(([oldName, items]) => {
        return oldName == category ? [name, items] : [oldName, items];
      });
      state.list = Object.fromEntries(entries);
      $sectionName.setAttribute("contenteditable", "false");
    });

    const $list = document.createElement("ul");
    items.forEach((i) => {
      const $listItem = document.createElement("li");

      const $name = document.createElement("span");
      $name.innerText = i.name;
      $name.setAttribute("contenteditable", "false");
      $name.addEventListener("pointerup", () => {
        $name.setAttribute("contenteditable", "true");
        $name.focus();
      });
      $name.addEventListener("blur", () => {
        const idx = list[category].findIndex((j) => j.name === i.name);
        if (idx > -1) {
          list[category][idx].name = $name.innerText;
          state.list = list;
        }
        $name.setAttribute("contenteditable", "false");
      });

      const $delete = document.createElement("button");
      $delete.innerText = "❌";
      $delete.addEventListener("click", () => {
        list[category] = list[category].filter((j) => j.name !== i.name);
        state.list = list;
      });

      const $check = document.createElement("input");
      $check.type = "checkbox";
      $check.checked = i.checked;
      $check.addEventListener("change", () => {
        const idx = list[category].findIndex((j) => j.name === i.name);
        if (idx > -1) {
          list[category][idx].checked = $check.checked;
          state.list = list;
        }
      });

      $listItem.append($check);
      $listItem.append($name);
      $listItem.append($delete);
      $list.append($listItem);
    });

    const $addItem = document.createElement("button");
    $addItem.classList.add("add-item");
    $addItem.innerText = "Add Item";
    $addItem.addEventListener("click", () => {
      const name = window.prompt("Insert item name");
      if (name) {
        const item = { name, checked: false };
        list[category].push(item);
        state.list = list;
      }
    });

    $section.append($sectionName);
    $section.append($list);
    $section.append($addItem);
    $main.append($section);
  }

  const $addCategory = document.createElement("button");
  $addCategory.classList.add("add-category");
  $addCategory.innerText = "Add Category";
  $addCategory.addEventListener("click", () => {
    const name = window.prompt("Insert category name");
    if (name) {
      list[name] = [];
      state.list = list;
    }
  });

  $main.append($addCategory);
}

(function () {
  const hash = location.hash.slice(1);
  if (hash) {
    const rawList = LZString.decompressFromEncodedURIComponent(hash);
    state.list = decode(rawList);
  } else {
    state.list = {};
  }
  render();
})();
