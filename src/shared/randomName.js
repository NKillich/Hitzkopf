// Zufällige Spielernamen wie "FunkyOtter"
const adjectives = [
    'Crazy', 'Wild', 'Happy', 'Sleepy', 'Sneaky', 'Fluffy', 'Grumpy', 'Lazy',
    'Brave', 'Clumsy', 'Fancy', 'Jolly', 'Mighty', 'Spicy', 'Turbo', 'Funky',
    'Dizzy', 'Cheeky', 'Bouncy', 'Silly', 'Stormy', 'Snappy', 'Zesty', 'Peppy',
    'Jumpy', 'Fuzzy', 'Nutty', 'Sassy', 'Feisty', 'Crunchy'
]
const animals = [
    'Unicorn', 'Dragon', 'Panda', 'Tiger', 'Wolf', 'Bear', 'Fox', 'Penguin',
    'Koala', 'Dolphin', 'Eagle', 'Gecko', 'Hamster', 'Llama', 'Meerkat',
    'Narwhal', 'Platypus', 'Quokka', 'Raccoon', 'Sloth', 'Capybara', 'Axolotl',
    'Wombat', 'Flamingo', 'Otter', 'Hedgehog', 'Chameleon', 'Manatee', 'Tapir', 'Binturong'
]

export const generateRandomName = () => {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
    const animal = animals[Math.floor(Math.random() * animals.length)]
    return `${adj}${animal}`
}
