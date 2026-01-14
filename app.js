if (typeof window === "undefined") {
  console.error(
    "This file is meant to run in the browser. Start the preview server with `npm run dev` and open http://localhost:8000."
  );
  process.exit(1);
}

const components = [
  "Component 1",
  "Component 2",
  "Component 3",
  "Component 4",
  "Component 5",
  "Component 6",
];

const defaultFields = [
  {
    id: crypto.randomUUID(),
    name: "Decision",
    type: "textarea",
    options: [],
  },
  {
    id: crypto.randomUUID(),
    name: "Summary",
    type: "textarea",
    options: [],
  },
  {
    id: crypto.randomUUID(),
    name: "Rationale",
    type: "textarea",
    options: [],
  },
  {
    id: crypto.randomUUID(),
    name: "Owner",
    type: "text",
    options: [],
  },
  {
    id: crypto.randomUUID(),
    name: "Status",
    type: "select",
    options: ["Proposed", "Approved", "Pending", "Needs Review"],
  },
  {
    id: crypto.randomUUID(),
    name: "Due Date",
    type: "text",
    options: [],
  },
];

let fieldLibrary = [...defaultFields];
let decisionCards = [];
let commentLog = [];

const componentGrid = document.getElementById("componentGrid");
const commentList = document.getElementById("commentList");
const commentTemplate = document.getElementById("commentTemplate");
const pointingStatus = document.getElementById("pointingStatus");
const micStatus = document.getElementById("micStatus");
const addGeneralComment = document.getElementById("addGeneralComment");
const transcriptOutput = document.getElementById("transcriptOutput");
const pipelineStepsContainer = document.getElementById("pipelineSteps");
const startRecording = document.getElementById("startRecording");
const stopRecording = document.getElementById("stopRecording");
const decisionCardsContainer = document.getElementById("decisionCards");
const createDecisionCardButton = document.getElementById("createDecisionCard");
const cardTemplate = document.getElementById("cardTemplate");
const fieldRowTemplate = document.getElementById("fieldRowTemplate");
const fieldForm = document.getElementById("fieldForm");
const fieldLibraryContainer = document.getElementById("fieldLibrary");
const fieldNameInput = document.getElementById("fieldName");
const fieldTypeInput = document.getElementById("fieldType");
const fieldOptionsInput = document.getElementById("fieldOptions");

let recognition;
let isListening = false;
let activeComponent = null;
let pipelineQueue = Promise.resolve();

const formatTimestamp = (date = new Date()) =>
  date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const pipelineSteps = [
  { id: "listening", label: "Listening for intent" },
  { id: "transcribing", label: "Transcribing speech" },
  { id: "extracting", label: "Extracting decisions" },
  { id: "normalizing", label: "Normalizing fields" },
  { id: "generating", label: "Generating decision card" },
];

const renderPipeline = (activeStepId, completedStepIds = []) => {
  pipelineStepsContainer.innerHTML = "";
  pipelineSteps.forEach((step) => {
    const item = document.createElement("li");
    item.className = "pipeline-step";
    if (step.id === activeStepId) {
      item.classList.add("active");
    }
    if (completedStepIds.includes(step.id)) {
      item.classList.add("complete");
    }
    item.textContent = step.label;
    const status = document.createElement("span");
    status.textContent = completedStepIds.includes(step.id)
      ? "Done"
      : step.id === activeStepId
        ? "Running"
        : "Idle";
    item.appendChild(status);
    pipelineStepsContainer.appendChild(item);
  });
};

const sleep = (duration) =>
  new Promise((resolve) => {
    setTimeout(resolve, duration);
  });

const renderComponents = () => {
  componentGrid.innerHTML = "";
  components.forEach((name) => {
    const card = document.createElement("div");
    card.className = "component";

    const label = document.createElement("span");
    label.className = "component-name";
    label.textContent = name;

    const commentButton = document.createElement("button");
    commentButton.className = "secondary";
    commentButton.textContent = "Add Comment";
    commentButton.addEventListener("click", () =>
      addComment(`Comment on ${name}`, name)
    );

    card.addEventListener("mousedown", () => setPointing(name, card));
    card.addEventListener("mouseup", () => clearPointing(card));
    card.addEventListener("mouseleave", () => clearPointing(card));

    card.append(label, commentButton);
    componentGrid.appendChild(card);
  });
};

const setPointing = (name, element) => {
  activeComponent = name;
  element.classList.add("pointing");
  pointingStatus.textContent = `Pointing at ${name}`;
  pointingStatus.classList.add("active");
};

const clearPointing = (element) => {
  if (activeComponent) {
    activeComponent = null;
    pointingStatus.textContent = "Not pointing";
    pointingStatus.classList.remove("active");
  }
  element.classList.remove("pointing");
};

const addComment = (text, tag = "General") => {
  const entry = {
    id: crypto.randomUUID(),
    text,
    tag,
    timestamp: new Date(),
  };
  commentLog = [entry, ...commentLog];
  renderComments();
};

const renderComments = () => {
  commentList.innerHTML = "";
  commentLog.forEach((entry) => {
    const node = commentTemplate.content.cloneNode(true);
    node.querySelector(".comment-tag").textContent = entry.tag;
    node.querySelector("p").textContent = entry.text;
    node.querySelector("time").textContent = formatTimestamp(entry.timestamp);
    commentList.appendChild(node);
  });
};

const initializeSpeechRecognition = () => {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    transcriptOutput.textContent =
      "Speech recognition is not supported in this browser. Try Chrome for live transcription.";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onresult = (event) => {
    let interimTranscript = "";
    let finalTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    transcriptOutput.textContent = `${finalTranscript}\n${interimTranscript}`.trim();

    if (finalTranscript.trim()) {
      pipelineQueue = pipelineQueue.then(() =>
        runAiPipeline(finalTranscript.trim())
      );
    }
  };

  recognition.onerror = (event) => {
    micStatus.textContent = `Mic error: ${event.error}`;
    micStatus.classList.remove("active");
    micStatus.classList.add("muted");
  };

  recognition.onend = () => {
    if (isListening) {
      recognition.start();
    } else {
      micStatus.textContent = "Mic idle";
      micStatus.classList.remove("active");
      micStatus.classList.add("muted");
    }
  };
};

const startListening = () => {
  if (!recognition) {
    return;
  }
  isListening = true;
  recognition.start();
  micStatus.textContent = "Listening...";
  micStatus.classList.add("active");
  micStatus.classList.remove("muted");
  startRecording.disabled = true;
  stopRecording.disabled = false;
};

const stopListening = () => {
  if (!recognition) {
    return;
  }
  isListening = false;
  recognition.stop();
  startRecording.disabled = false;
  stopRecording.disabled = true;
};

const createDecisionCardFromTranscript = (transcript) => {
  const summary = transcript.trim();
  const decision = extractDecision(summary);
  const owner = extractOwner(summary);
  const status = extractStatus(summary);
  const confidence = estimateConfidence(summary);

  return {
    id: crypto.randomUUID(),
    title: "Decision from live transcript",
    createdAt: new Date(),
    fields: fieldLibrary.map((field) => ({
      ...field,
      value:
        field.name === "Summary"
          ? summary
          : field.name === "Decision"
            ? decision
            : field.name === "Owner"
              ? owner
              : field.name === "Status"
                ? status
                : "",
    })),
    source: `Auto-generated from speech: "${decision.trim()}"`,
    confidence,
  };
};

const createEmptyDecisionCard = () => ({
  id: crypto.randomUUID(),
  title: "New Decision Card",
  createdAt: new Date(),
  fields: fieldLibrary.map((field) => ({ ...field, value: "" })),
  source: "Manual entry",
});

const renderDecisionCards = () => {
  decisionCardsContainer.innerHTML = "";
  decisionCards.forEach((card) => {
    const cardNode = cardTemplate.content.cloneNode(true);
    const titleInput = cardNode.querySelector(".card-title");
    const subtitle = cardNode.querySelector(".card-subtitle");
    const cardBody = cardNode.querySelector(".card-body");
    const addFieldSelect = cardNode.querySelector(".add-field-select");
    const addFieldButton = cardNode.querySelector(".add-field");
    const deleteButton = cardNode.querySelector(".delete-card");

    titleInput.value = card.title;
    titleInput.addEventListener("input", (event) => {
      card.title = event.target.value;
    });

    subtitle.textContent = card.confidence
      ? `Model confidence: ${(card.confidence * 100).toFixed(0)}%`
      : "Manual capture";

    const availableFieldOptions = fieldLibrary.filter(
      (field) => !card.fields.find((entry) => entry.id === field.id)
    );
    addFieldSelect.innerHTML = "";
    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = "Select field";
    addFieldSelect.appendChild(placeholderOption);
    availableFieldOptions.forEach((field) => {
      const option = document.createElement("option");
      option.value = field.id;
      option.textContent = field.name;
      addFieldSelect.appendChild(option);
    });

    addFieldButton.disabled = availableFieldOptions.length === 0;

    addFieldButton.addEventListener("click", () => {
      const fieldId = addFieldSelect.value;
      if (!fieldId) {
        return;
      }
      const selectedField = fieldLibrary.find((field) => field.id === fieldId);
      if (!selectedField) {
        return;
      }
      card.fields.push({ ...selectedField, value: "" });
      renderDecisionCards();
    });

    deleteButton.addEventListener("click", () => {
      decisionCards = decisionCards.filter((entry) => entry.id !== card.id);
      renderDecisionCards();
    });

    card.fields.forEach((field) => {
      const row = fieldRowTemplate.content.cloneNode(true);
      row.querySelector(".field-label").textContent = field.name;
      const inputWrapper = row.querySelector(".field-input");
      let input;
      if (field.type === "textarea") {
        input = document.createElement("textarea");
        input.value = field.value || "";
      } else if (field.type === "select") {
        input = document.createElement("select");
        field.options.forEach((optionValue) => {
          const option = document.createElement("option");
          option.value = optionValue;
          option.textContent = optionValue;
          input.appendChild(option);
        });
        input.value = field.value || field.options[0] || "";
      } else {
        input = document.createElement("input");
        input.type = "text";
        input.value = field.value || "";
      }

      input.addEventListener("input", (event) => {
        field.value = event.target.value;
      });

      inputWrapper.appendChild(input);
      row.querySelector(".remove-field").addEventListener("click", () => {
        card.fields = card.fields.filter((entry) => entry.id !== field.id);
        renderDecisionCards();
      });

      cardBody.appendChild(row);
    });

    const meta = cardNode.querySelector(".card-meta");
    meta.textContent = `${card.source} • ${formatTimestamp(card.createdAt)}`;

    decisionCardsContainer.appendChild(cardNode);
  });
};

const extractDecision = (transcript) => {
  const match =
    transcript.match(/decide to ([^.]+)/i) ||
    transcript.match(/we will ([^.]+)/i) ||
    transcript.match(/we should ([^.]+)/i);
  if (match) {
    return match[1].trim();
  }
  return transcript.split(".")[0] || transcript;
};

const extractOwner = (transcript) => {
  const match = transcript.match(/owner is ([^.]+)/i);
  return match ? match[1].trim() : "";
};

const extractStatus = (transcript) => {
  if (/approved/i.test(transcript)) {
    return "Approved";
  }
  if (/pending/i.test(transcript)) {
    return "Pending";
  }
  if (/review/i.test(transcript)) {
    return "Needs Review";
  }
  return "Proposed";
};

const estimateConfidence = (transcript) => {
  const wordCount = transcript.split(/\s+/).filter(Boolean).length;
  const confidence = Math.min(0.9, 0.5 + wordCount / 50);
  return Math.max(0.4, confidence);
};

const runAiPipeline = async (transcript) => {
  renderPipeline("listening");
  await sleep(300);
  renderPipeline("transcribing", ["listening"]);
  await sleep(350);
  renderPipeline("extracting", ["listening", "transcribing"]);
  await sleep(400);
  renderPipeline("normalizing", ["listening", "transcribing", "extracting"]);
  await sleep(400);
  renderPipeline("generating", [
    "listening",
    "transcribing",
    "extracting",
    "normalizing",
  ]);
  await sleep(350);

  const decisionCard = createDecisionCardFromTranscript(transcript);
  decisionCards = [decisionCard, ...decisionCards];
  renderDecisionCards();
  renderPipeline(null, pipelineSteps.map((step) => step.id));
};

const renderFieldLibrary = () => {
  fieldLibraryContainer.innerHTML = "";
  fieldLibrary.forEach((field) => {
    const item = document.getElementById("libraryItemTemplate").content.cloneNode(true);
    item.querySelector(".library-name").textContent = field.name;
    item.querySelector(".library-type").textContent = field.type;
    item.querySelector(".library-options").textContent =
      field.type === "select"
        ? `Options: ${field.options.join(", ") || "None"}`
        : "";

    item.querySelector(".remove-library").addEventListener("click", () => {
      fieldLibrary = fieldLibrary.filter((entry) => entry.id !== field.id);
      decisionCards = decisionCards.map((card) => ({
        ...card,
        fields: card.fields.filter((entry) => entry.id !== field.id),
      }));
      renderFieldLibrary();
      renderDecisionCards();
    });

    fieldLibraryContainer.appendChild(item);
  });
};

const handleFieldFormSubmit = (event) => {
  event.preventDefault();
  const name = fieldNameInput.value.trim();
  if (!name) {
    return;
  }
  const type = fieldTypeInput.value;
  const options = fieldOptionsInput.value
    .split(",")
    .map((option) => option.trim())
    .filter(Boolean);

  const newField = {
    id: crypto.randomUUID(),
    name,
    type,
    options: type === "select" ? options : [],
  };

  fieldLibrary = [...fieldLibrary, newField];
  decisionCards = decisionCards.map((card) => ({
    ...card,
    fields: [...card.fields, { ...newField, value: "" }],
  }));

  fieldForm.reset();
  renderFieldLibrary();
  renderDecisionCards();
};

addGeneralComment.addEventListener("click", () => {
  addComment("General comment captured from the design review.");
});

createDecisionCardButton.addEventListener("click", () => {
  decisionCards = [createEmptyDecisionCard(), ...decisionCards];
  renderDecisionCards();
});

startRecording.addEventListener("click", startListening);
stopRecording.addEventListener("click", stopListening);
fieldForm.addEventListener("submit", handleFieldFormSubmit);

renderComponents();
renderComments();
renderFieldLibrary();
initializeSpeechRecognition();
renderPipeline();
