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

let hideTicked = false;

// Maps each draggable DOM node back to the data it represents, so we can
// rebuild order from the live DOM after a drag without relying on indices.
const itemRef = new WeakMap<HTMLElement, ListItem>();
const categoryRef = new WeakMap<HTMLElement, string>();

// Pointer-based reordering (works on touch and mouse). Dragging the handle
// live-moves `node` among its same-type siblings; on release `onDrop` commits
// the new DOM order back into state.
function enableDrag(
  node: HTMLElement,
  handle: HTMLElement,
  container: HTMLElement,
  selector: string,
  endMarker: Element | null,
  onDrop: () => void,
) {
  handle.style.touchAction = "none";
  handle.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    node.classList.add("dragging");
    let moved = false;

    // A line that marks where the dragged element will land.
    const indicator = document.createElement("div");
    indicator.classList.add("drop-indicator");

    const move = (ev: PointerEvent) => {
      ev.preventDefault();
      moved = true;
      const siblings = [
        ...container.querySelectorAll(`:scope > ${selector}`),
      ].filter((s) => s !== node);
      const ref =
        siblings.find((s) => {
          const r = s.getBoundingClientRect();
          return ev.clientY < r.top + r.height / 2;
        }) ?? endMarker;
      container.insertBefore(indicator, ref);
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      node.classList.remove("dragging");
      if (moved) container.insertBefore(node, indicator);
      indicator.remove();
      if (moved) onDrop();
    };

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  });
}

function makeHandle(): HTMLSpanElement {
  const $handle = document.createElement("span");
  $handle.classList.add("drag-handle");
  $handle.innerText = "⠿";
  $handle.setAttribute("aria-label", "Drag to reorder");
  return $handle;
}

function render() {
  const list = state.list;

  $main.innerHTML = "";

  const $topbar = document.createElement("header");
  $topbar.classList.add("topbar");

  const $title = document.createElement("h1");
  $title.classList.add("title");
  $title.innerText = "🥦 Groceries";

  const $hideTicked = document.createElement("button");
  $hideTicked.classList.add("hide-ticked");
  $hideTicked.classList.toggle("active", hideTicked);
  $hideTicked.innerText = hideTicked ? "Show ticked" : "Hide ticked";
  $hideTicked.addEventListener("click", () => {
    hideTicked = !hideTicked;
    render();
  });

  $topbar.append($title);
  $topbar.append($hideTicked);
  $main.append($topbar);

  // Created up front so it can act as the end-boundary when dragging a category
  // section to the bottom of the list.
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

  for (const [category, items] of Object.entries(list)) {
    const $section = document.createElement("section");
    categoryRef.set($section, category);

    const $head = document.createElement("div");
    $head.classList.add("section-head");

    const $sectionHandle = makeHandle();
    enableDrag($section, $sectionHandle, $main, "section", $addCategory, () => {
      const order = [...$main.querySelectorAll(":scope > section")].map((s) =>
        categoryRef.get(s as HTMLElement),
      );
      const reordered: List = {};
      for (const c of order) {
        if (c !== undefined) reordered[c] = list[c];
      }
      state.list = reordered;
    });

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
    const visibleItems = hideTicked ? items.filter((i) => !i.checked) : items;

    const commitItemOrder = () => {
      const order = [...$list.querySelectorAll(":scope > li")].map((li) =>
        itemRef.get(li as HTMLElement),
      );
      let vi = 0;
      // Hidden (ticked) items keep their slots; visible items fill the rest in
      // their new DOM order.
      list[category] = list[category].map((it) =>
        hideTicked && it.checked ? it : order[vi++]!,
      );
      state.list = list;
    };

    visibleItems.forEach((i) => {
      const $listItem = document.createElement("li");
      $listItem.classList.toggle("checked", i.checked);
      itemRef.set($listItem, i);

      const $itemHandle = makeHandle();
      enableDrag($listItem, $itemHandle, $list, "li", null, commitItemOrder);

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

      $listItem.append($itemHandle);
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

    $head.append($sectionHandle);
    $head.append($sectionName);
    $section.append($head);
    $section.append($list);
    $section.append($addItem);
    $main.append($section);
  }

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
