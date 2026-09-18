const confirm = async (rl, question, defaultValue = true) => {
  const answer = await rl.question(
    `${question} (${defaultValue ? "Y/n" : "y/N"}): `,
  );
  if (answer === "" && defaultValue === true) {
    return "y";
  } else if (answer === "" && defaultValue === false) {
    return "n";
  }
  return answer.toLowerCase().match(/^y/i) ? "y" : "n";
};

const choose = async (rl, question, items) => {
  const answer = await rl.question(
    `${question} (${items.map((item, index) => `${index + 1}. ${item}`).join(", ")}): `,
  );

  const index = parseInt(answer, 10) - 1;
  if (index >= 0 && index < items.length) {
    return items[index];
  } else {
    return null;
  }
};

const ask = async (
  rl,
  question,
  { default: defaultValue, validate, bounceLog, maxRetries = 0 },
) => {
  let answer;
  if (bounceLog) {
    console.log(bounceLog(answer ?? defaultValue));
  }

  answer = await rl.question(`${question} (${defaultValue ? "Y/n" : "y/N"}): `);
  answer = answer.trim();

  if (validate) {
    let retries = 0;
    while (retries < maxRetries) {
      const validationResult = validate(answer);
      if (validationResult === true) {
        break;
      }
      console.log(validationResult);
      retries++;
      if (retries < maxRetries) {
        return ask(rl, question, {
          default: defaultValue,
          validate,
          maxRetries: maxRetries - retries,
        });
      } else {
        console.log(
          "Maximum retries reached.  Should we proceed with your last attempt? The correct game id is...?",
        );
        return await ask(rl, question, {
          default: defaultValue,
          validate,
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
