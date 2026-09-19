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
  const answer = await rl.question(
    `${question} Enter the number corresponding to your choice: (${items.map((item, index) => `${index + 1}. ${item}`).join(", ")}): `,
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

  if (validate) {
    for (let i = 0; i <= maxRetries; i++) {
      const validationResult = validate(answer);
      if (validationResult === true) {
        break;
      }
      console.log(validationResult);
      if (i < maxRetries) {
        answer = await ask(rl, question, {
          default: defaultValue,
          validate,
          bounceLog,
          maxRetries: maxRetries - i,
        });
      } else {
        console.log(
          "Maximum retries reached. Should we proceed with your last attempt?",
        );
        answer = await ask(rl, question, {
          default: defaultValue,
          validate,
          bounceLog,
          maxRetries: 0,
        });
      }
    }
  } else if (answer === "" && defaultValue !== undefined) {
    return defaultValue;
  }

  return answer;
};

export { confirm, choose, ask };
