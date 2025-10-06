/**
 * Sets up the AI Assist plugin with preset prompts for content creation
 */

import { assist } from "@sanity/assist";

import postType from "../schemas/documents/post";

export const assistWithPresets = () =>
  assist({
    __presets: {
      [postType.name]: {
        fields: [
          {
            /**
             * Creates Portable Text `content` blocks from the `title` field
             */
            path: "content",
            instructions: [
              {
                _key: "preset-instruction-1",
                title: "Generate sample content",
                icon: "block-content",
                prompt: [
                  {
                    _key: "86e70087d4d5",
                    markDefs: [],
                    children: [
                      {
                        _type: "span",
                        marks: [],
                        text: "Given the draft title ",
                        _key: "6b5d5d6a63cf0",
                      },
                      {
                        path: "title",
                        _type: "sanity.assist.instruction.fieldRef",
                        _key: "0132742d463b",
                      },
                      {
                        _type: "span",
                        marks: [],
                        text: " of a blog post, generate a comprehensive and engaging sample content that spans the length of one to two A4 pages. The content should be structured, informative, and tailored to the subject matter implied by the title, whether it be travel, software engineering, fashion, politics, or any other theme. The text will be displayed below the ",
                        _key: "a02c9ab4eb2d",
                      },
                      {
                        _type: "sanity.assist.instruction.fieldRef",
                        _key: "f208ef240062",
                        path: "title",
                      },
                      {
                        text: " and doesn't need to repeat it in the text. The generated text should include the following elements:",
                        _key: "8ecfa74a8487",
                        _type: "span",
                        marks: [],
                      },
                    ],
                    _type: "block",
                    style: "normal",
                  },
                  {
                    style: "normal",
                    _key: "e4dded41ea89",
                    markDefs: [],
                    children: [
                      {
                        _type: "span",
                        marks: [],
                        text: "1. Introduction: A brief paragraph that captures the essence of the blog post, hooks the reader with intriguing insights, and outlines the purpose of the post.",
                        _key: "cc5ef44a2fb5",
                      },
                    ],
                    _type: "block",
                  },
                  {
                    style: "normal",
                    _key: "585e8de2fe35",
                    markDefs: [],
                    children: [
                      {
                        _type: "span",
                        marks: [],
                        text: "2. Main Body:",
                        _key: "fab36eb7c541",
                      },
                    ],
                    _type: "block",
                  },
                  {
                    _type: "block",
                    style: "normal",
                    _key: "e96b89ef6357",
                    markDefs: [],
                    children: [
                      {
                        _type: "span",
                        marks: [],
                        text: "- For thematic consistency, divide the body into several sections with subheadings that explore different facets of the topic.",
                        _key: "b685a310a0ff",
                      },
                    ],
                  },
                  {
                    children: [
                      {
                        marks: [],
                        text: "- Include engaging and informative content such as personal anecdotes (for travel or fashion blogs), technical explanations or tutorials (for software engineering blogs), satirical or humorous observations (for shitposting), or well-argued positions (for political blogs).",
                        _key: "c7468d106c91",
                        _type: "span",
                      },
                    ],
                    _type: "block",
                    style: "normal",
                    _key: "ce4acdb00da9",
                    markDefs: [],
                  },
                  {
                    _type: "block",
                    style: "normal",
                    _key: "fb4572e65833",
                    markDefs: [],
                    children: [
                      {
                        _type: "span",
                        marks: [],
                        text: "- ",
                        _key: "5358f261dce4",
                      },
                      {
                        _type: "span",
                        marks: [],
                        text: " observations (for shitposting), or well-argued positions (for political blogs).",
                        _key: "50792c6d0f77",
                      },
                    ],
                  },
                  {
                    children: [
                      {
                        marks: [],
                        text: "Where applicable, incorporate bullet points or numbered lists to break down complex information, steps in a process, or key highlights.",
                        _key: "3b891d8c1dde0",
                        _type: "span",
                      },
                    ],
                    _type: "block",
                    style: "normal",
                    _key: "9364b67074ce",
                    markDefs: [],
                  },
                  {
                    _key: "a6ba7579cd66",
                    markDefs: [],
                    children: [
                      {
                        _type: "span",
                        marks: [],
                        text: "3. Conclusion: Summarize the main points discussed in the post, offer final thoughts or calls to action, and invite readers to engage with the content through comments or social media sharing.",
                        _key: "1280f11d499d",
                      },
                    ],
                    _type: "block",
                    style: "normal",
                  },
                  {
                    style: "normal",
                    _key: "719a79eb4c1c",
                    markDefs: [],
                    children: [
                      {
                        marks: [],
                        text: "4. Engagement Prompts: Conclude with questions or prompts that encourage readers to share their experiences, opinions, or questions related to the blog post's topic, but keep in mind there is no Comments field below the blog post.",
                        _key: "f1512086bab6",
                        _type: "span",
                      },
                    ],
                    _type: "block",
                  },
                  {
                    _type: "block",
                    style: "normal",
                    _key: "4a1c586fd44a",
                    markDefs: [],
                    children: [
                      {
                        marks: [],
                        text: "Ensure the generated content maintains a balance between being informative and entertaining, to capture the interest of a wide audience. The sample content should serve as a solid foundation that can be further customized or expanded upon by the blog author to finalize the post.",
                        _key: "697bbd03cb110",
                        _type: "span",
                      },
                    ],
                  },
                  {
                    children: [
                      {
                        marks: [],
                        text: 'Don\'t prefix each section with "Introduction", "Main Body", "Conclusion" or "Engagement Prompts"',
                        _key: "d20bb9a03b0d",
                        _type: "span",
                      },
                    ],
                    _type: "block",
                    style: "normal",
                    _key: "b072b3c62c3c",
                    markDefs: [],
                  },
                ],
              },
            ],
          },
          {
            /**
             * Summarize content into the `excerpt` field
             */
            path: "excerpt",
            instructions: [
              {
                _key: "preset-instruction-2",
                title: "Summarize content",
                icon: "blockquote",
                prompt: [
                  {
                    markDefs: [],
                    children: [
                      {
                        _key: "650a0dcc327d",
                        _type: "span",
                        marks: [],
                        text: "Create a short excerpt based on ",
                      },
                      {
                        path: "content",
                        _type: "sanity.assist.instruction.fieldRef",
                        _key: "c62d14c73496",
                      },
                      {
                        _key: "38e043efa606",
                        _type: "span",
                        marks: [],
                        text: " that doesn't repeat what's already in the ",
                      },
                      {
                        path: "title",
                        _type: "sanity.assist.instruction.fieldRef",
                        _key: "445e62dda246",
                      },
                      {
                        _key: "98cce773915e",
                        _type: "span",
                        marks: [],
                        text: " . Consider the UI has limited horizontal space and try to avoid too many line breaks and make it as short, terse and brief as possible. At best a single sentence, at most two sentences.",
                      },
                    ],
                    _type: "block",
                    style: "normal",
                    _key: "392c618784b0",
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  });
