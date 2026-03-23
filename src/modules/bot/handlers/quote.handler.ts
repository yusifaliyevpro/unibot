import axios from "axios";

type Quote = { q: string; a: string; h: string };

export async function getQuote() {
  try {
    const response = await axios.get<Quote[]>("https://zenquotes.io/api/today");
    const quote = response.data;
    return { author: quote[0].a, quote: quote[0].q };
  } catch (error) {
    console.log(error);
  }
}
