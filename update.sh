time=$(date +%F)
touch "------------------------.txt"
git reset --soft 8a0b27d521acb6ae1a208e35b10a2c05ebd378c6 >> out.txt
git add . >> out.txt
git commit -m "Updated $time" >> out.txt
git push --force >> out.txt
