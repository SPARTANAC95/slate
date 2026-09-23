const views = {
  calendar: {src:'assets/calendar.png', alt:'Slate month calendar with countdowns, scheduled entries, and a daily note', caption:'The whole month, the next few plans, and a little space for today.'},
  upcoming: {src:'assets/upcoming.png', alt:'Slate upcoming list with countdowns and an undated backlog', caption:'Everything you are waiting for, in order. Even the ideas without a date.'},
  year: {src:'assets/year.png', alt:'Slate year overview showing scheduled and completed days', caption:'A small record of the plans you made and the things you enjoyed.'}
};
const screen = document.querySelector('#app-screen');
const caption = document.querySelector('#screen-caption');
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  const view = views[button.dataset.view];
  screen.src = view.src;
  screen.alt = view.alt;
  caption.textContent = view.caption;
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
}));
const examples = {
  event:{input:'#event cinema tomorrow 20:00',title:'cinema',date:'Tomorrow at 20:00',kind:'event'},
  task:{input:'#task book tickets in 3 days',title:'book tickets',date:'In 3 days',kind:'task'},
  backlog:{input:'#film The Glass Harbour',title:'The Glass Harbour',date:'Saved to backlog',kind:'film'}
};
document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => {
  const example = examples[button.dataset.example];
  document.querySelector('#example-input').textContent = example.input;
  document.querySelector('#example-title').textContent = example.title;
  document.querySelector('#example-date').textContent = example.date;
  document.querySelector('#example-dot').className = `dot ${example.kind}`;
  document.querySelectorAll('[data-example]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
}));
const dialog = document.querySelector('#image-dialog');
document.querySelector('.screen-button').addEventListener('click', () => {
  const image = document.querySelector('#large-image');
  image.src = screen.src;
  image.alt = screen.alt;
  dialog.showModal();
});
document.querySelector('#close-image').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
