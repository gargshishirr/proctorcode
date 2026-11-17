export const sampleTests = [
  {
    title: 'Two Sum',
    language: 'javascript',
    duration_minutes: 30,
    description: `## Two Sum

Given an array of integers \`nums\` and an integer \`target\`, return the **indices** of the two numbers that add up to \`target\`.

You may assume that each input has **exactly one solution**, and you may not use the same element twice.

### Example
\`\`\`
Input:  nums = [2, 7, 11, 15], target = 9
Output: [0, 1]   // because nums[0] + nums[1] == 9
\`\`\`

### Constraints
- 2 <= nums.length <= 10^4
- Only one valid answer exists.`,
    starter_code: `/**
 * @param {number[]} nums
 * @param {number} target
 * @return {number[]}
 */
function twoSum(nums, target) {
  // Write your solution here
}
`,
  },
  {
    title: 'Valid Palindrome',
    language: 'python',
    duration_minutes: 25,
    description: `## Valid Palindrome

A phrase is a **palindrome** if, after converting all uppercase letters to lowercase and removing all non-alphanumeric characters, it reads the same forward and backward.

Given a string \`s\`, return \`True\` if it is a palindrome, otherwise \`False\`.

### Example
\`\`\`
Input:  s = "A man, a plan, a canal: Panama"
Output: True
\`\`\``,
    starter_code: `class Solution:
    def isPalindrome(self, s: str) -> bool:
        # Write your solution here
        pass
`,
  },
  {
    title: 'FizzBuzz',
    language: 'javascript',
    duration_minutes: 15,
    description: `## FizzBuzz

Return an array of strings from \`1\` to \`n\` where:
- multiples of 3 -> \`"Fizz"\`
- multiples of 5 -> \`"Buzz"\`
- multiples of both 3 and 5 -> \`"FizzBuzz"\`
- otherwise the number itself as a string.`,
    starter_code: `function fizzBuzz(n) {
  // Write your solution here
}
`,
  },
];
