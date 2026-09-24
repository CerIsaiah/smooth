// One dated diary entry. Entries land here while an experiment is running —
// short notes, one number each, boring days included.
export function DiaryEntry({ date, text }) {
  return (
    <div className="flex items-start gap-3 sm:gap-4">
      <time
        dateTime={date}
        className="text-xs sm:text-sm text-gray-500 whitespace-nowrap mt-1 w-20 sm:w-24"
      >
        {date}
      </time>
      <p className="text-sm sm:text-base text-gray-700 leading-relaxed">{text}</p>
    </div>
  );
}
