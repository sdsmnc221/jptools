const confirm = async (rl, question, defaultValue = true) => {
  const answer = await rl.question(
    `${question} (${defaultValue ? "Y/n" : "y/N"}): `,
  );
  if (answer === "" && defaultValue === true) {
    return true;
  } else if (answer === "" && defaultValue === false) {
    return false;
  }
  return answer.toLowerCase().match(/^y/i) ? true : false;
};

const choose = async (rl, question, items) => {
  const answer = await ask(
    rl,
    `${question} Enter the number corresponding to your choice: (${items.map((item, index) => `${index + 1}. ${item}`).join(", ")}): `,
    {
      default: items.length,
      maxRetries: 3,
      validate: (input) => {
        const index = parseInt(input, 10) - 1;
        if (index >= 0 && index < items.length) {
          return true;
        }
        return "Invalid choice. Please select a valid option.";
      },
    },
  );

  const index = parseInt(answer, 10) - 1;
  if (index >= 0 && index < items.length) {
    return items[index];
  } else {
    throw new Error("Invalid choice. Please select a valid option.");
  }
};

const ask = async (
  rl,
  question,
  { default: defaultValue, validate, bounceLog, maxRetries = 0 },
) => {
  let answer;

  answer = await rl.question(
    `${question} ${defaultValue && `(${defaultValue})`}: `,
  );
  answer = answer.trim() === "" ? defaultValue : answer.trim();

  if (bounceLog) {
    console.log(bounceLog(answer));
  }

  for (let i = 0; i <= maxRetries; i++) {
    answer =
      (
        await rl.question(
          `${question} ${defaultValue && `(${defaultValue})`}: `,
        )
      ).trim() || defaultValue;
    const validationResult = validate ? validate(answer) : true;
    if (validationResult === true) return answer;
  }

  // out of retries, return the last answer
  return answer;
};

export { confirm, choose, ask };
