import * as TestLogic from "../test/test-logic";
import * as TestUI from "../test/test-ui";
import * as TestStats from "../test/test-stats";
import * as Monkey from "../test/monkey";
import Config, * as UpdateConfig from "../config";
import * as Keymap from "../elements/keymap";
import * as Misc from "../misc";
import * as LiveAcc from "../test/live-acc";
import * as LiveBurst from "../test/live-burst";
import * as Funbox from "../test/funbox";
import * as Sound from "./sound-controller";
import * as Caret from "../test/caret";
import * as ManualRestart from "../test/manual-restart-tracker";
import * as Notifications from "../elements/notifications";
import * as CustomText from "../test/custom-text";
import * as UI from "../ui";
import * as Settings from "../pages/settings";
import * as LayoutEmulator from "../test/layout-emulator";
import * as PaceCaret from "../test/pace-caret";
import * as TimerProgress from "../test/timer-progress";
import * as TestTimer from "../test/test-timer";
import * as Focus from "../test/focus";
import * as ShiftTracker from "../test/shift-tracker";
import * as Replay from "../test/replay.js";
import * as MonkeyPower from "../elements/monkey-power";
import * as WeakSpot from "../test/weak-spot";
import * as Leaderboards from "../elements/leaderboards";
import * as ActivePage from "./../states/active-page";
import * as TestActive from "./../states/test-active";

let dontInsertSpace = false;
let correctShiftUsed = true;

function setWordsInput(value) {
  // Only change #wordsInput if it's not already the wanted value
  // Avoids Safari triggering unneeded events, causing issues with
  // dead keys.
  // console.log("settings words input to " + value);
  if (value !== $("#wordsInput").val()) {
    $("#wordsInput").val(value);
  }
}

function updateUI() {
  let acc = Misc.roundTo2(TestStats.calculateAccuracy());
  if (!isNaN(acc)) LiveAcc.update(acc);

  if (Config.keymapMode === "next" && Config.mode !== "zen") {
    Keymap.highlightKey(
      TestLogic.words
        .getCurrent()
        .charAt(TestLogic.input.current.length)
        .toString()
        .toUpperCase()
    );
  }
}

function backspaceToPrevious() {
  if (!TestActive.get()) return;

  if (
    TestLogic.input.history.length == 0 ||
    TestUI.currentWordElementIndex == 0
  )
    return;

  if (
    (TestLogic.input.history[TestLogic.words.currentIndex - 1] ==
      TestLogic.words.get(TestLogic.words.currentIndex - 1) &&
      !Config.freedomMode) ||
    $($(".word")[TestLogic.words.currentIndex - 1]).hasClass("hidden")
  ) {
    return;
  }

  if (Config.confidenceMode === "on" || Config.confidenceMode === "max") {
    return;
  }

  TestLogic.input.current = TestLogic.input.popHistory();
  TestLogic.corrected.popHistory();
  if (Config.funbox === "nospace" || Config.funbox === "arrows") {
    TestLogic.input.current = TestLogic.input.current.slice(0, -1);
  }
  TestLogic.words.decreaseCurrentIndex();
  TestUI.setCurrentWordElementIndex(TestUI.currentWordElementIndex - 1);
  TestUI.updateActiveElement(true);
  Funbox.toggleScript(TestLogic.words.getCurrent());
  TestUI.updateWordElement();

  Caret.updatePosition();
  Replay.addReplayEvent("backWord");
}

function handleSpace() {
  if (!TestActive.get()) return;

  if (TestLogic.input.current === "") return;

  if (Config.mode == "zen") {
    $("#words .word.active").removeClass("active");
    $("#words").append("<div class='word active'></div>");
  }

  let currentWord = TestLogic.words.getCurrent();
  if (Config.funbox === "layoutfluid" && Config.mode !== "time") {
    // here I need to check if Config.customLayoutFluid exists because of my scuffed solution of returning whenever value is undefined in the setCustomLayoutfluid function
    const layouts = Config.customLayoutfluid
      ? Config.customLayoutfluid.split("#")
      : ["qwerty", "dvorak", "colemak"];
    let index = 0;
    let outof = TestLogic.words.length;
    index = Math.floor(
      (TestLogic.input.history.length + 1) / (outof / layouts.length)
    );
    if (Config.layout !== layouts[index] && layouts[index] !== undefined) {
      Notifications.add(`--- !!! ${layouts[index]} !!! ---`, 0);
    }
    UpdateConfig.setLayout(layouts[index]);
    UpdateConfig.setKeymapLayout(layouts[index]);
    Keymap.highlightKey(
      TestLogic.words
        .getCurrent()
        .charAt(TestLogic.input.current.length)
        .toString()
        .toUpperCase()
    );
    Settings.groups.layout?.updateInput();
  }
  dontInsertSpace = true;

  let burst = TestStats.calculateBurst();
  LiveBurst.update(Math.round(burst));
  TestStats.pushBurstToHistory(burst);

  //correct word or in zen mode
  const isWordCorrect =
    currentWord == TestLogic.input.current || Config.mode == "zen";
  MonkeyPower.addPower(isWordCorrect, true);
  TestStats.incrementAccuracy(isWordCorrect);
  if (isWordCorrect) {
    PaceCaret.handleSpace(true, currentWord);
    TestLogic.input.pushHistory();
    TestLogic.words.increaseCurrentIndex();
    TestUI.setCurrentWordElementIndex(TestUI.currentWordElementIndex + 1);
    TestUI.updateActiveElement();
    Funbox.toggleScript(TestLogic.words.getCurrent());
    Caret.updatePosition();
    TestStats.incrementKeypressCount();
    TestStats.pushKeypressWord(TestLogic.words.currentIndex);
    if (Config.funbox !== "nospace" && Config.funbox !== "arrows") {
      Sound.playClick(Config.playSoundOnClick);
    }
    Replay.addReplayEvent("submitCorrectWord");
  } else {
    if (Config.funbox !== "nospace" && Config.funbox !== "arrows") {
      if (!Config.playSoundOnError || Config.blindMode) {
        Sound.playClick(Config.playSoundOnClick);
      } else {
        Sound.playError(Config.playSoundOnError);
      }
    }
    TestStats.pushMissedWord(TestLogic.words.getCurrent());
    TestStats.incrementKeypressErrors();
    let cil = TestLogic.input.current.length;
    if (cil <= TestLogic.words.getCurrent().length) {
      if (cil >= TestLogic.corrected.current.length) {
        TestLogic.corrected.current += "_";
      } else {
        TestLogic.corrected.current =
          TestLogic.corrected.current.substring(0, cil) +
          "_" +
          TestLogic.corrected.current.substring(cil + 1);
      }
    }
    if (Config.stopOnError != "off") {
      if (Config.difficulty == "expert" || Config.difficulty == "master") {
        //failed due to diff when pressing space
        TestLogic.fail("difficulty");
        return;
      }
      if (Config.stopOnError == "word") {
        dontInsertSpace = false;
        Replay.addReplayEvent("incorrectLetter", "_");
        TestUI.updateWordElement(true);
        Caret.updatePosition();
      }
      return;
    }
    PaceCaret.handleSpace(false, currentWord);
    if (Config.blindMode) $("#words .word.active letter").addClass("correct");
    TestLogic.input.pushHistory();
    TestUI.highlightBadWord(TestUI.currentWordElementIndex, !Config.blindMode);
    TestLogic.words.increaseCurrentIndex();
    TestUI.setCurrentWordElementIndex(TestUI.currentWordElementIndex + 1);
    TestUI.updateActiveElement();
    Funbox.toggleScript(TestLogic.words.getCurrent());
    Caret.updatePosition();
    TestStats.incrementKeypressCount();
    TestStats.pushKeypressWord(TestLogic.words.currentIndex);
    TestStats.updateLastKeypress();
    if (Config.difficulty == "expert" || Config.difficulty == "master") {
      TestLogic.fail("difficulty");
      return;
    } else if (TestLogic.words.currentIndex == TestLogic.words.length) {
      //submitted last word that is incorrect
      TestLogic.finish();
      return;
    }
    Replay.addReplayEvent("submitErrorWord");
  }

  let wordLength;
  if (Config.mode === "zen") {
    wordLength = TestLogic.input.current.length;
  } else {
    wordLength = TestLogic.words.getCurrent().length;
  }

  let flex = Misc.whorf(Config.minBurstCustomSpeed, wordLength);
  if (
    (Config.minBurst === "fixed" && burst < Config.minBurstCustomSpeed) ||
    (Config.minBurst === "flex" && burst < flex)
  ) {
    TestLogic.fail("min burst");
    return;
  }

  TestLogic.corrected.pushHistory();

  if (
    !Config.showAllLines ||
    Config.mode == "time" ||
    (CustomText.isWordRandom && CustomText.word == 0) ||
    CustomText.isTimeRandom
  ) {
    let currentTop = Math.floor(
      document.querySelectorAll("#words .word")[
        TestUI.currentWordElementIndex - 1
      ].offsetTop
    );
    let nextTop;
    try {
      nextTop = Math.floor(
        document.querySelectorAll("#words .word")[
          TestUI.currentWordElementIndex
        ].offsetTop
      );
    } catch (e) {
      nextTop = 0;
    }

    if (nextTop > currentTop && !TestUI.lineTransition) {
      TestUI.lineJump(currentTop);
    }
  } //end of line wrap

  if (Config.keymapMode === "react") {
    Keymap.flashKey("Space", true);
  }
  if (
    Config.mode === "words" ||
    Config.mode === "custom" ||
    Config.mode === "quote" ||
    Config.mode === "zen"
  ) {
    TimerProgress.update(TestTimer.time);
  }
  if (
    Config.mode == "time" ||
    Config.mode == "words" ||
    Config.mode == "custom" ||
    Config.mode == "quote"
  ) {
    TestLogic.addWord();
  }
}

function isCharCorrect(char, charIndex) {
  if (!correctShiftUsed) return false;

  if (Config.mode == "zen") {
    return true;
  }

  const originalChar = TestLogic.words.getCurrent()[charIndex];

  if (originalChar == char) {
    return true;
  }

  if (Config.language.split("_")[0] == "russian") {
    if ((char === "е" || char === "e") && originalChar == "ё") {
      return true;
    }
    if (char === "ё" && (originalChar == "е" || originalChar === "e")) {
      return true;
    }
  }

  if (Config.funbox === "arrows") {
    if ((char === "w" || char === "ArrowUp") && originalChar == "↑") {
      return true;
    }
    if ((char === "s" || char === "ArrowDown") && originalChar == "↓") {
      return true;
    }
    if ((char === "a" || char === "ArrowLeft") && originalChar == "←") {
      return true;
    }
    if ((char === "d" || char === "ArrowRight") && originalChar == "→") {
      return true;
    }
  }

  if (char === "’" && originalChar == "'") {
    return true;
  }

  if (char === "'" && originalChar == "’") {
    return true;
  }

  if (
    (char === `’` || char === "'") &&
    (originalChar == `’` || originalChar === "'")
  ) {
    return true;
  }

  if (
    (char === `"` || char === "”" || char == "“" || char === "„") &&
    (originalChar == `"` ||
      originalChar === "”" ||
      originalChar === "“" ||
      originalChar === "„")
  ) {
    return true;
  }

  if (
    (char === "–" || char === "—" || char == "-") &&
    (originalChar == "-" || originalChar === "–" || originalChar === "—")
  ) {
    return true;
  }

  return false;
}

function handleChar(char, charIndex) {
  if (TestUI.resultCalculating || TestUI.resultVisible) {
    return;
  }

  if (char === "…") {
    for (let i = 0; i < 3; i++) {
      handleChar(".", charIndex + i);
    }

    return;
  }

  if (char === "\n" && Config.funbox === "58008") {
    char = " ";
  }

  if (char !== "\n" && char !== "\t" && /\s/.test(char)) {
    if (Config.funbox === "nospace" || Config.funbox === "arrows") return;
    handleSpace();

    //insert space for expert and master or strict space,
    //or for stop on error set to word,
    //otherwise dont do anything
    if (
      Config.difficulty !== "normal" ||
      (Config.strictSpace && Config.mode !== "zen") ||
      Config.stopOnError === "word"
    ) {
      if (dontInsertSpace) {
        dontInsertSpace = false;
        return;
      }
    } else {
      return;
    }
  }

  if (
    Config.mode !== "zen" &&
    TestLogic.words.getCurrent()[charIndex] !== "\n" &&
    char === "\n"
  ) {
    return;
  }

  //start the test
  if (!TestActive.get() && !TestLogic.startTest()) {
    return;
  }

  Focus.set(true);
  Caret.stopAnimation();

  let thisCharCorrect = isCharCorrect(char, charIndex);

  if (thisCharCorrect && Config.mode !== "zen") {
    char = TestLogic.words.getCurrent().charAt(charIndex);
  }

  if (!thisCharCorrect && char === "\n") {
    if (TestLogic.input.current === "") return;
    char = " ";
  }

  if (TestLogic.input.current === "") {
    TestStats.setBurstStart(performance.now());
  }

  const resultingWord =
    TestLogic.input.current.substring(0, charIndex) +
    char +
    TestLogic.input.current.substring(charIndex + 1);

  if (!thisCharCorrect && Misc.trailingComposeChars.test(resultingWord)) {
    TestLogic.input.current = resultingWord;
    TestUI.updateWordElement();
    Caret.updatePosition();
    return;
  }

  MonkeyPower.addPower(thisCharCorrect);
  TestStats.incrementAccuracy(thisCharCorrect);

  if (!thisCharCorrect) {
    TestStats.incrementKeypressErrors();
    TestStats.pushMissedWord(TestLogic.words.getCurrent());
  }

  WeakSpot.updateScore(
    Config.mode === "zen" ? char : TestLogic.words.getCurrent()[charIndex],
    thisCharCorrect
  );

  if (thisCharCorrect) {
    Sound.playClick(Config.playSoundOnClick);
  } else {
    if (!Config.playSoundOnError || Config.blindMode) {
      Sound.playClick(Config.playSoundOnClick);
    } else {
      Sound.playError(Config.playSoundOnError);
    }
  }

  if (!correctShiftUsed && Config.difficulty != "master") return;

  //update current corrected version. if its empty then add the current char. if its not then replace the last character with the currently pressed one / add it
  if (TestLogic.corrected.current === "") {
    TestLogic.corrected.current += resultingWord;
  } else {
    if (charIndex >= TestLogic.corrected.current.length) {
      TestLogic.corrected.current += char;
    } else if (!thisCharCorrect) {
      TestLogic.corrected.current =
        TestLogic.corrected.current.substring(0, charIndex) +
        char +
        TestLogic.corrected.current.substring(charIndex + 1);
    }
  }

  TestStats.incrementKeypressCount();
  TestStats.updateLastKeypress();
  TestStats.pushKeypressWord(TestLogic.words.currentIndex);

  if (Config.stopOnError == "letter" && !thisCharCorrect) {
    return;
  }

  Replay.addReplayEvent(
    thisCharCorrect ? "correctLetter" : "incorrectLetter",
    char
  );

  //update the active word top, but only once
  if (
    TestLogic.input.current.length === 1 &&
    TestLogic.words.currentIndex === 0
  ) {
    TestUI.setActiveWordTop(document.querySelector("#words .active").offsetTop);
  }

  //max length of the input is 20 unless in zen mode then its 30
  if (
    (Config.mode === "zen" && charIndex < 30) ||
    (Config.mode !== "zen" &&
      charIndex < TestLogic.words.getCurrent().length + 20)
  ) {
    TestLogic.input.current = resultingWord;
  }

  if (!thisCharCorrect && Config.difficulty == "master") {
    TestLogic.input.pushHistory();
    TestLogic.corrected.pushHistory();
    TestLogic.fail("difficulty");
    return;
  }

  //keymap
  if (Config.keymapMode === "react") {
    Keymap.flashKey(char, thisCharCorrect);
  }

  if (Config.mode != "zen") {
    //not applicable to zen mode
    //auto stop the test if the last word is correct
    let currentWord = TestLogic.words.getCurrent();
    let lastindex = TestLogic.words.currentIndex;
    if (
      (currentWord == TestLogic.input.current ||
        (Config.quickEnd &&
          currentWord.length == TestLogic.input.current.length &&
          Config.stopOnError == "off")) &&
      lastindex == TestLogic.words.length - 1
    ) {
      TestLogic.input.pushHistory();
      TestLogic.corrected.pushHistory();
      TestLogic.finish();
      return;
    }
  }

  let activeWordTopBeforeJump = document.querySelector("#words .word.active")
    .offsetTop;
  TestUI.updateWordElement();

  if (!Config.hideExtraLetters) {
    let newActiveTop = document.querySelector("#words .word.active").offsetTop;
    //stop the word jump by slicing off the last character, update word again
    if (
      activeWordTopBeforeJump < newActiveTop &&
      !TestUI.lineTransition &&
      TestLogic.input.current.length > 1
    ) {
      if (Config.mode == "zen") {
        let currentTop = Math.floor(
          document.querySelectorAll("#words .word")[
            TestUI.currentWordElementIndex - 1
          ].offsetTop
        );
        if (!Config.showAllLines) TestUI.lineJump(currentTop);
      } else {
        TestLogic.input.current = TestLogic.input.current.slice(0, -1);
        TestUI.updateWordElement();
      }
    }
  }

  //simulate space press in nospace funbox
  if (
    ((Config.funbox === "nospace" || Config.funbox === "arrows") &&
      TestLogic.input.current.length === TestLogic.words.getCurrent().length) ||
    (char === "\n" && thisCharCorrect)
  ) {
    handleSpace();
  }

  if (char !== "\n") {
    Caret.updatePosition();
  }
}

function handleTab(event) {
  if (TestUI.resultCalculating) {
    event.preventDefault();
  }
  if (
    !$("#presetWrapper").hasClass("hidden") ||
    !$("#tagsWrapper").hasClass("hidden")
  ) {
    event.preventDefault();
    return;
  }
  if ($("#customTextPopup .textarea").is(":focus")) {
    event.preventDefault();

    let area = $("#customTextPopup .textarea")[0];

    var start = area.selectionStart;
    var end = area.selectionEnd;

    // set textarea value to: text before caret + tab + text after caret
    area.value =
      area.value.substring(0, start) + "\t" + area.value.substring(end);

    // put caret at right position again
    area.selectionStart = area.selectionEnd = start + 1;

    return;
  } else if (
    !TestUI.resultCalculating &&
    $("#commandLineWrapper").hasClass("hidden") &&
    $("#simplePopupWrapper").hasClass("hidden") &&
    $("#quoteSubmitPopupWrapper").hasClass("hidden") &&
    ActivePage.get() != "pageLogin"
  ) {
    if (ActivePage.get() == "pageTest") {
      if (Config.quickTab) {
        if (!$("#leaderboardsWrapper").hasClass("hidden")) {
          Leaderboards.hide();
        }
        if (
          TestUI.resultVisible ||
          !(
            (Config.mode == "zen" && !event.shiftKey) ||
            (TestLogic.hasTab && !event.shiftKey)
          )
        ) {
          if (event.shiftKey) {
            ManualRestart.set();
          } else {
            ManualRestart.reset();
          }
          event.preventDefault();
          if (
            TestActive.get() &&
            Config.repeatQuotes === "typing" &&
            Config.mode === "quote"
          ) {
            TestLogic.restart(true, false, event);
          } else {
            TestLogic.restart(false, false, event);
          }
        } else {
          event.preventDefault();
          handleChar("\t", TestLogic.input.current.length);
          setWordsInput(" " + TestLogic.input.current);
        }
      } else if (!TestUI.resultVisible) {
        if (
          (TestLogic.hasTab && event.shiftKey) ||
          (!TestLogic.hasTab && Config.mode !== "zen") ||
          (Config.mode === "zen" && event.shiftKey)
        ) {
          event.preventDefault();
          $("#restartTestButton").focus();
        } else {
          event.preventDefault();
          handleChar("\t", TestLogic.input.current.length);
          setWordsInput(" " + TestLogic.input.current);
        }
      }
    } else if (Config.quickTab) {
      event.preventDefault();
      UI.changePage("test");
    }
  }
}

$(document).keydown((event) => {
  if (ActivePage.get() == "pageLoading") return event.preventDefault();

  //autofocus
  const wordsFocused = $("#wordsInput").is(":focus");
  const pageTestActive = ActivePage.get() === "pageTest";
  const commandLineVisible = !$("#commandLineWrapper").hasClass("hidden");
  const leaderboardsVisible = !$("#leaderboardsWrapper").hasClass("hidden");

  const popups = document.querySelectorAll(".popupWrapper");

  let popupVisible = false;
  for (const popup of popups) {
    if (!popup.classList.contains("hidden") === true) {
      popupVisible = true;
      break;
    }
  }

  const allowTyping =
    pageTestActive &&
    !commandLineVisible &&
    !leaderboardsVisible &&
    !popupVisible &&
    !TestUI.resultVisible &&
    (wordsFocused || event.key !== "Enter");

  if (allowTyping && !wordsFocused && event.key !== "Enter") {
    TestUI.focusWords();
    if (Config.showOutOfFocusWarning) {
      event.preventDefault();
    }
  }

  //tab
  if (
    (event.key == "Tab" && !Config.swapEscAndTab) ||
    (event.key == "Escape" && Config.swapEscAndTab)
  ) {
    handleTab(event);
  }

  if (!allowTyping) return;

  if (!event.originalEvent?.isTrusted || TestUI.testRestarting) {
    event.preventDefault();
    return;
  }

  if (TestStats.spacingDebug)
    console.log(
      "spacing debug",
      "keypress",
      event.key,
      "length",
      TestStats.keypressTimings.spacing.array.length
    );
  TestStats.recordKeypressSpacing();
  TestStats.setKeypressDuration(performance.now());
  TestStats.setKeypressNotAfk();

  //blocking firefox from going back in history with backspace
  if (event.key === "Backspace") {
    Sound.playClick(Config.playSoundOnClick);
    let t = /INPUT|SELECT|TEXTAREA/i;
    if (
      !t.test(event.target.tagName) ||
      event.target.disabled ||
      event.target.readOnly
    ) {
      event.preventDefault();
    }

    if (Config.confidenceMode === "max") {
      event.preventDefault();
      return;
    }
  }

  if (Config.funbox !== "arrows" && /Arrow/i.test(event.key)) {
    event.preventDefault();
    return;
  }

  Monkey.type();

  if (event.key === "Backspace" && TestLogic.input.current.length === 0) {
    backspaceToPrevious();
    if (TestLogic.input.current)
      setWordsInput(" " + TestLogic.input.current + " ");
  }

  if (event.key === "Enter") {
    if (event.shiftKey && Config.mode == "zen") {
      TestLogic.finish();
    } else if (
      event.shiftKey &&
      ((Config.mode == "time" && Config.time === 0) ||
        (Config.mode == "words" && Config.words === 0))
    ) {
      TestLogic.setBailout(true);
      TestLogic.finish();
    } else {
      handleChar("\n", TestLogic.input.current.length);
      setWordsInput(" " + TestLogic.input.current);
    }
  }

  //show dead keys
  if (
    event.key === "Dead" &&
    !Misc.trailingComposeChars.test(TestLogic.input.current)
  ) {
    Sound.playClick(Config.playSoundOnClick);
    $(
      document.querySelector("#words .word.active").querySelectorAll("letter")[
        TestLogic.input.current.length
      ]
    ).toggleClass("dead");
  }

  if (Config.oppositeShiftMode !== "off") {
    correctShiftUsed = ShiftTracker.isUsingOppositeShift(event) !== false;
  }
  if (Config.funbox === "arrows") {
    let char = event.key;
    if (["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(char)) {
      if (char === "ArrowLeft") char = "a";
      if (char === "ArrowRight") char = "d";
      if (char === "ArrowDown") char = "s";
      if (char === "ArrowUp") char = "w";
      event.preventDefault();
      handleChar(char, TestLogic.input.current.length);
      updateUI();
      setWordsInput(" " + TestLogic.input.current);
    }
  } else if (
    Config.layout !== "default" &&
    !(
      event.ctrlKey ||
      (event.altKey && window.navigator.platform.search("Linux") > -1)
    )
  ) {
    const char = LayoutEmulator.getCharFromEvent(event);
    if (char !== null) {
      event.preventDefault();
      handleChar(char, TestLogic.input.current.length);
      updateUI();
      setWordsInput(" " + TestLogic.input.current);
    }
  }
});

$("#wordsInput").keyup((event) => {
  if (!event.originalEvent?.isTrusted || TestUI.testRestarting) {
    event.preventDefault();
    return;
  }

  if (TestUI.resultVisible) return;
  let now = performance.now();
  if (TestStats.keypressTimings.duration.current !== -1) {
    let diff = Math.abs(TestStats.keypressTimings.duration.current - now);
    TestStats.pushKeypressDuration(diff);
  }
  TestStats.setKeypressDuration(now);
  Monkey.stop();
});

$("#wordsInput").on("beforeinput", (event) => {
  if (!event.originalEvent?.isTrusted) return;
  if (event.target.value === "") {
    event.target.value = " ";
  }
});

$("#wordsInput").on("input", (event) => {
  if (!event.originalEvent?.isTrusted || TestUI.testRestarting) {
    event.target.value = " ";
    return;
  }

  TestStats.setKeypressNotAfk();

  const realInputValue = event.target.value.normalize();
  const inputValue = realInputValue.slice(1);

  // input will be modified even with the preventDefault() in
  // beforeinput/keydown if it's part of a compose sequence. this undoes
  // the effects of that and takes the input out of compose mode.
  if (
    Config.layout !== "default" &&
    inputValue.length >= TestLogic.input.current.length
  ) {
    setWordsInput(" " + TestLogic.input.current);
    return;
  }

  if (realInputValue.length === 0 && TestLogic.input.current.length === 0) {
    // fallback for when no Backspace keydown event (mobile)
    backspaceToPrevious();
  } else if (inputValue.length < TestLogic.input.current.length) {
    TestLogic.input.current = inputValue;
    TestUI.updateWordElement();
    Caret.updatePosition();
    if (!Misc.trailingComposeChars.test(TestLogic.input.current)) {
      Replay.addReplayEvent("setLetterIndex", TestLogic.input.current.length);
    }
  } else if (inputValue !== TestLogic.input.current) {
    let diffStart = 0;
    while (inputValue[diffStart] === TestLogic.input.current[diffStart])
      diffStart++;

    for (let i = diffStart; i < inputValue.length; i++) {
      handleChar(inputValue[i], i);
    }
  }

  setWordsInput(" " + TestLogic.input.current);
  updateUI();

  // force caret at end of input
  // doing it on next cycle because Chromium on Android won't let me edit
  // the selection inside the input event
  setTimeout(() => {
    if (
      event.target.selectionStart !== event.target.value.length &&
      (!Misc.trailingComposeChars.test(event.target.value) ||
        event.target.selectionStart <
          event.target.value.search(Misc.trailingComposeChars))
    ) {
      event.target.selectionStart = event.target.selectionEnd =
        event.target.value.length;
    }
  }, 0);
});

$("#wordsInput").focus((event) => {
  event.target.selectionStart = event.target.selectionEnd =
    event.target.value.length;
});

$("#wordsInput").on("copy paste", (event) => {
  event.preventDefault();
});